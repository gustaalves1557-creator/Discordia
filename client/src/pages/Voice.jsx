import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff, MonitorUp, MonitorOff, Volume2, VolumeX, PhoneOff, Maximize2, Minimize2 } from 'lucide-react';
import { getVoiceSettings, subscribeVoiceSettings, micMeter } from '../voiceStore';
import { Avatar } from './Chat';

// Sala de voz/video/tela via WebRTC mesh + Socket.IO signaling.
// - Maior socket.id inicia a oferta (sem glare)
// - Mic com ganho + gate de sensibilidade + medidor
// - Filtros (ruído/eco/agc) e troca de microfone sem sair da call
// - H.264 (HW) ou perfil econômico p/ a tela
// - Apresentação: palco grande + trilho de câmeras (estilo Discord)
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function preferCodec(pc, hwOn) {
  try {
    const caps = RTCRtpSender.getCapabilities('video');
    if (!caps?.codecs?.length) return;
    const want = hwOn ? 'video/h264' : 'video/vp8';
    const first = caps.codecs.filter((c) => c.mimeType.toLowerCase() === want);
    if (!first.length) return;
    const rest = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== want);
    for (const t of pc.getTransceivers()) {
      const isVideo = t.sender.track
        ? t.sender.track.kind === 'video'
        : t.receiver.track?.kind === 'video';
      if (!isVideo) continue;
      try { t.setCodecPreferences([...first, ...rest]); } catch {}
    }
  } catch {}
}

async function tuneScreenSender(sender, track, hwOn) {
  try {
    if (track && hwOn) track.contentHint = 'detail';
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    const enc = params.encodings[0];
    if (hwOn) {
      enc.maxBitrate = 8000000;
      enc.maxFramerate = 60;
      enc.priority = 'high';
      params.degradationPreference = 'maintain-resolution';
    } else {
      enc.maxBitrate = 2500000;
      enc.maxFramerate = 30;
      enc.priority = 'medium';
      params.degradationPreference = 'balanced';
    }
    await sender.setParameters(params);
  } catch {}
}

async function untuneSender(sender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings?.length) return;
    params.degradationPreference = 'balanced';
    delete params.encodings[0].maxBitrate;
    delete params.encodings[0].maxFramerate;
    await sender.setParameters(params);
  } catch {}
}

function audioConstraints(cfg) {
  return {
    deviceId: cfg.inputDeviceId ? { exact: cfg.inputDeviceId } : undefined,
    noiseSuppression: cfg.noiseSuppression,
    echoCancellation: cfg.echoCancellation,
    autoGainControl: cfg.autoGain,
  };
}

export default function Voice({ channelId, channelName, socket, onLeave }) {
  const [peers, setPeers] = useState({});
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [micVol, setMicVol] = useState(100);
  const [status, setStatus] = useState('Conectando...');
  const [mediaNote, setMediaNote] = useState('');
  const [hw, setHw] = useState(null);
  const [hasCam, setHasCam] = useState(true);
  const [outputDeviceId, setOutputDeviceId] = useState(getVoiceSettings().outputDeviceId || '');
  const [shareSources, setShareSources] = useState(null); // modal de escolha (app desktop)
  const [fsId, setFsId] = useState(null); // chave do palco em tela cheia
  const shareResolve = useRef(null);
  const stageBoxRefs = useRef({});
  const localRef = useRef(null);
  const screenPrevRef = useRef(null);
  const streamRef = useRef(null);
  const screenRef = useRef(null);
  const audioCtxRef = useRef(null);
  const gainRef = useRef(null);
  const srcRef = useRef(null);
  const analyserRef = useRef(null);
  const micTrackRef = useRef(null);
  const mutedRef = useRef(false);
  const micVolRef = useRef(100);
  const pcs = useRef({});
  const names = useRef({});
  const myId = useRef(null);

  const patchPeer = (sid, patch) => {
    setPeers((prev) => {
      const cur = prev[sid] || { username: names.current[sid] || '?', streams: [], muted: false, sharing: false, volume: 1 };
      return { ...prev, [sid]: { ...cur, ...patch } };
    });
  };

  useEffect(() => {
    let dead = false;
    let meterTimer = null;
    let gateSmooth = 1;
    myId.current = socket.id;
    const cfg0 = getVoiceSettings();
    setOutputDeviceId(cfg0.outputDeviceId || '');

    const remember = (sid, username) => {
      if (username) names.current[sid] = username;
      setPeers((prev) => (prev[sid] ? prev : { ...prev, [sid]: { username: names.current[sid] || '?', streams: [], muted: false, sharing: false, volume: 1 } }));
    };

    const ensurePC = (peerId) => {
      if (pcs.current[peerId]) return pcs.current[peerId];
      const pc = new RTCPeerConnection(ICE);
      pcs.current[peerId] = pc;
      const s = streamRef.current;
      const kinds = new Set();
      if (s) {
        s.getVideoTracks().forEach((t) => { pc.addTrack(t, s); kinds.add('video'); });
      }
      const mic = micTrackRef.current;
      if (mic) {
        pc.addTrack(mic, mic._stream || undefined);
        kinds.add('audio');
      } else if (s?.getAudioTracks().length) {
        s.getAudioTracks().forEach((t) => pc.addTrack(t, s));
        kinds.add('audio');
      }
      // voz com prioridade e bitrate cheio (Opus até 64 kbps, sem fome de banda)
      const asender = pc.getSenders().find((x) => x.track?.kind === 'audio');
      if (asender) {
        (async () => {
          try {
            const p = asender.getParameters();
            if (!p.encodings?.length) p.encodings = [{}];
            p.encodings[0].maxBitrate = 64000;
            p.encodings[0].priority = 'high';
            await asender.setParameters(p);
          } catch {}
        })();
      }
      if (!kinds.has('audio')) { try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {} }
      if (!kinds.has('video')) { try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch {} }
      const sc = screenRef.current;
      if (sc) sc.getTracks().forEach((t) => pc.addTrack(t, sc));
      preferCodec(pc, getVoiceSettings().hwAccel !== false);
      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('voice:signal', { to: peerId, data: e.candidate });
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0];
        if (!stream) return;
        stream.getTracks().forEach((t) => {
          t.onunmute = () => setPeers((prev) => ({ ...prev }));
        });
        setPeers((prev) => {
          const cur = prev[peerId] || { username: names.current[peerId] || '?', streams: [], muted: false, sharing: false, volume: 1 };
          if (cur.streams.some((x) => x.id === stream.id)) return prev;
          return { ...prev, [peerId]: { ...cur, streams: [...cur.streams, stream] } };
        });
      };
      pc.onnegotiationneeded = async () => {
        if (dead || pc.signalingState !== 'stable') return;
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:signal', { to: peerId, data: pc.localDescription });
        } catch {}
      };
      return pc;
    };

    const callPeer = async (peerId) => {
      try {
        const pc = ensurePC(peerId);
        const hasAudio = pc.getSenders().some((x) => x.track?.kind === 'audio');
        const hasVideo = pc.getSenders().some((x) => x.track?.kind === 'video');
        const offer = await pc.createOffer({
          offerToReceiveAudio: !hasAudio,
          offerToReceiveVideo: !hasVideo,
        });
        await pc.setLocalDescription(offer);
        socket.emit('voice:signal', { to: peerId, data: pc.localDescription });
      } catch {}
    };

    const iInitiate = (remoteId) => myId.current && remoteId && myId.current > remoteId;

    const onPeers = (list) => {
      if (dead) return;
      setStatus('Na chamada');
      for (const p of list || []) {
        remember(p.socketId, p.username);
        if (iInitiate(p.socketId)) callPeer(p.socketId);
      }
    };
    const onPeerJoin = ({ socketId, username }) => {
      if (dead || !socketId) return;
      remember(socketId, username);
      if (iInitiate(socketId)) callPeer(socketId);
    };
    const onSignal = async ({ from, data }) => {
      if (dead || !from || !data) return;
      try {
        if (data.type === 'offer') {
          const pc = ensurePC(from);
          if (pc.signalingState !== 'stable') {
            try { await pc.setRemoteDescription({ type: 'rollback' }); } catch {}
          }
          await pc.setRemoteDescription(data);
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          socket.emit('voice:signal', { to: from, data: pc.localDescription });
          setStatus('Na chamada');
        } else if (data.type === 'answer') {
          const pc = pcs.current[from];
          if (pc && pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(data);
        } else if (data.candidate) {
          try { await pcs.current[from]?.addIceCandidate(data); } catch {}
        }
      } catch {}
    };
    const onPeerLeave = ({ socketId }) => {
      if (!socketId) return;
      try { pcs.current[socketId]?.close(); } catch {}
      delete pcs.current[socketId];
      delete names.current[socketId];
      setPeers((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
    };
    const onPeerMute = ({ socketId, muted: m }) => patchPeer(socketId, { muted: m });
    const onPeerSharing = ({ socketId, sharing: sh }) => patchPeer(socketId, { sharing: sh });

    // medidor + gate de sensibilidade com hangover (não picota a fala)
    function startMeter(ctx, analyser) {
      const buf = new Uint8Array(analyser.fftSize);
      let lastVoice = 0;
      meterTimer = setInterval(() => {
        if (dead) return;
        try {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const lvl = Math.min(100, Math.round(Math.sqrt(sum / buf.length) * 300));
          micMeter.level = mutedRef.current ? 0 : lvl;
          const cfg = getVoiceSettings();
          const now = Date.now();
          if (lvl >= (cfg.sensThreshold || 0)) lastVoice = now;
          let target = Math.max(0, Math.min(2, micVolRef.current / 100));
          if (mutedRef.current) target = 0;
          // gate só fecha 350ms depois do silêncio (evita cortar fim de frase)
          else if (cfg.autoSens && now - lastVoice > 350) target = 0;
          gateSmooth += (target - gateSmooth) * 0.35;
          if (gainRef.current) gainRef.current.gain.value = gateSmooth;
        } catch {}
      }, 100);
    }

    function buildGraph(ctx, stream) {
      const src = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      gain.gain.value = 1;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const dest = ctx.createMediaStreamDestination();
      src.connect(gain); gain.connect(dest); src.connect(analyser);
      const processed = dest.stream.getAudioTracks()[0];
      if (processed) {
        processed._stream = dest.stream;
        micTrackRef.current = processed;
      }
      srcRef.current = src;
      gainRef.current = gain;
      analyserRef.current = analyser;
      startMeter(ctx, analyser);
    }

    // troca de microfone / filtros sem sair da call
    async function applyAudioInput(cfg) {
      try {
        const ns = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(cfg) });
        if (dead) { ns.getTracks().forEach((t) => t.stop()); return; }
        const newTrack = ns.getAudioTracks()[0];
        if (!newTrack) return;
        const s = streamRef.current;
        const ctx = audioCtxRef.current;
        if (s) {
          const old = s.getAudioTracks()[0];
          if (old) { try { s.removeTrack(old); old.stop(); } catch {} }
          s.addTrack(newTrack);
        }
        if (ctx && s) {
          try { srcRef.current?.disconnect(); } catch {}
          const src = ctx.createMediaStreamSource(s);
          src.connect(gainRef.current);
          src.connect(analyserRef.current);
          srcRef.current = src;
        }
        if (localRef.current && s) localRef.current.srcObject = s;
        setMediaNote('');
      } catch {
        if (!dead) setMediaNote('Não foi possível trocar o microfone/filtro.');
      }
    }

    async function applyScreenProfile(hwOn) {
      for (const pc of Object.values(pcs.current)) {
        const sc = screenRef.current;
        const sender = sc && pc.getSenders().find((x) => sc.getVideoTracks().includes(x.track));
        if (sender) await tuneScreenSender(sender, sender.track, hwOn);
      }
    }

    const unsub = subscribeVoiceSettings((next, prev) => {
      if (dead) return;
      setOutputDeviceId(next.outputDeviceId || '');
      if (
        next.inputDeviceId !== prev.inputDeviceId ||
        next.noiseSuppression !== prev.noiseSuppression ||
        next.echoCancellation !== prev.echoCancellation ||
        next.autoGain !== prev.autoGain
      ) {
        applyAudioInput(next);
      }
      if (next.hwAccel !== prev.hwAccel) {
        applyScreenProfile(next.hwAccel !== false);
      }
    });

    async function init() {
      socket.on('voice:peers', onPeers);
      socket.on('voice:peer-join', onPeerJoin);
      socket.on('voice:signal', onSignal);
      socket.on('voice:peer-leave', onPeerLeave);
      socket.on('voice:peer-mute', onPeerMute);
      socket.on('voice:peer-sharing', onPeerSharing);

      const cfg = getVoiceSettings();
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(cfg), video: true });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(cfg), video: false });
          if (!dead) setMediaNote('Sem câmera: você está só com voz.');
        } catch {
          if (!dead) {
            setMediaNote('Sem microfone/câmera: você entrou só ouvindo/vendo. Libere a permissão para falar.');
            setStatus('Na chamada (só recebendo)');
          }
        }
      }
      if (dead) { stream?.getTracks().forEach((t) => t.stop()); return; }
      if (stream) {
        streamRef.current = stream;
        if (!dead) setHasCam(stream.getVideoTracks().length > 0);
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          const ctx = new AC();
          await ctx.resume().catch(() => {});
          audioCtxRef.current = ctx;
          buildGraph(ctx, stream);
        } catch {}
        if (localRef.current) localRef.current.srcObject = stream;
      }

      socket.emit('voice:join', { channelId, muted: false });
      if (!dead) setStatus((s) => (s === 'Conectando...' ? 'Na chamada' : s));
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Erro');
      setMediaNote('Este navegador não suporta voz/vídeo (use Chrome/Edge ou o app desktop).');
    } else {
      init();
    }

    return () => {
      dead = true;
      unsub();
      if (meterTimer) clearInterval(meterTimer);
      micMeter.level = 0;
      try { socket.emit('voice:leave', { channelId }); } catch {}
      socket.off('voice:peers', onPeers);
      socket.off('voice:peer-join', onPeerJoin);
      socket.off('voice:signal', onSignal);
      socket.off('voice:peer-leave', onPeerLeave);
      socket.off('voice:peer-mute', onPeerMute);
      socket.off('voice:peer-sharing', onPeerSharing);
      Object.values(pcs.current).forEach((pc) => { try { pc.close(); } catch {} });
      pcs.current = {};
      names.current = {};
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      micTrackRef.current = null;
      try { audioCtxRef.current?.close(); } catch {}
      audioCtxRef.current = null;
      gainRef.current = null;
      srcRef.current = null;
      analyserRef.current = null;
      screenRef.current?.getTracks().forEach((t) => t.stop());
      screenRef.current = null;
    };
  }, [channelId, socket]);

  useEffect(() => {
    if (!sharing) { setHw(null); return; }
    const id = setInterval(async () => {
      for (const pc of Object.values(pcs.current)) {
        try {
          const stats = await pc.getStats();
          for (const s of stats.values()) {
            const isVideo = s.kind === 'video' || s.mediaType === 'video';
            if (s.type === 'outbound-rtp' && isVideo && typeof s.powerEfficientEncoder === 'boolean') {
              setHw(s.powerEfficientEncoder);
              return;
            }
          }
        } catch {}
      }
    }, 3000);
    return () => clearInterval(id);
  }, [sharing]);

  useEffect(() => {
    if (sharing && screenPrevRef.current && screenRef.current) {
      screenPrevRef.current.srcObject = screenRef.current;
    }
    if (!sharing && screenPrevRef.current) {
      screenPrevRef.current.srcObject = null;
    }
  }, [sharing]);

  // garante a prévia local sempre anexada (trocar de layout remonta o <video>)
  useEffect(() => {
    if (localRef.current && streamRef.current && localRef.current.srcObject !== streamRef.current) {
      localRef.current.srcObject = streamRef.current;
    }
  });

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    const raw = streamRef.current?.getAudioTracks()[0];
    if (raw) raw.enabled = !next;
    setMuted(next);
    try { socket.emit('voice:mute', { channelId, muted: next }); } catch {}
  };
  const toggleCam = () => {
    const s = streamRef.current;
    if (!s?.getVideoTracks().length) return;
    s.getVideoTracks().forEach((t) => (t.enabled = camOff));
    setCamOff(!camOff);
  };
  const changeMicVol = (v) => {
    setMicVol(v);
    micVolRef.current = v;
  };

  // tela cheia no palco (botão ou Esc para sair)
  useEffect(() => {
    const onFs = () => {
      const el = document.fullscreenElement;
      setFsId(el?.dataset?.fskey || null);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = async (key) => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        const el = stageBoxRefs.current[key];
        if (el?.requestFullscreen) await el.requestFullscreen();
      }
    } catch {}
  };

  // seletor próprio (app desktop): modal com miniaturas, sem mensagem do sistema
  const pickDesktopSource = () => new Promise((resolve) => {
    (async () => {
      try {
        const sources = await window.discordia.getShareSources();
        if (!sources?.length) { resolve(null); return; }
        shareResolve.current = resolve;
        setShareSources(sources);
      } catch {
        resolve(null);
      }
    })();
  });

  const chooseShareSource = (src) => {
    const r = shareResolve.current;
    shareResolve.current = null;
    setShareSources(null);
    if (r) r(src || null);
  };

  const toggleShare = async () => {
    if (sharing) { stopShare(); return; }
    try {
      const isDesktop = !!(window.discordia?.desktop && window.discordia?.getShareSources);
      let sc;
      if (isDesktop) {
        const picked = await pickDesktopSource();
        if (!picked) return; // cancelou no seletor
        sc = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: picked.id },
          },
        });
      } else {
        sc = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60, max: 60 },
          },
          audio: false,
        });
      }
      if (!sc.getVideoTracks().length) return;
      screenRef.current = sc;
      const track = sc.getVideoTracks()[0];
      const hwOn = getVoiceSettings().hwAccel !== false;
      for (const pc of Object.values(pcs.current)) {
        const sender = pc.getSenders().find((x) => x.track?.kind === 'video');
        try {
          if (sender) { await sender.replaceTrack(track); pc._screenReplaced = true; }
          else { pc.addTrack(track, sc); pc._screenAdded = true; }
          await tuneScreenSender(sender || pc.getSenders().find((x) => x.track === track), track, hwOn);
        } catch {}
      }
      track.onended = () => stopShare();
      setSharing(true);
      try { socket.emit('voice:sharing', { channelId, sharing: true }); } catch {}
    } catch {
      // usuário cancelou a escolha da tela
    }
  };
  const stopShare = async () => {
    const sc = screenRef.current;
    screenRef.current = null;
    sc?.getTracks().forEach((t) => t.stop());
    const cam = streamRef.current?.getVideoTracks()[0];
    for (const pc of Object.values(pcs.current)) {
      try {
        if (pc._screenAdded) {
          pc.getSenders()
            .filter((x) => sc?.getVideoTracks().includes(x.track))
            .forEach((sender) => { try { pc.removeTrack(sender); } catch {} });
          pc._screenAdded = false;
        } else if (pc._screenReplaced && cam) {
          const vSender = pc.getSenders().find((x) => x.track?.kind === 'video');
          if (vSender) { await vSender.replaceTrack(cam); await untuneSender(vSender); }
          pc._screenReplaced = false;
        }
      } catch {}
    }
    setSharing(false);
    try { socket.emit('voice:sharing', { channelId, sharing: false }); } catch {}
  };

  const setPeerVolume = (sid, v) => {
    setPeers((prev) => (prev[sid] ? { ...prev, [sid]: { ...prev[sid], volume: v } } : prev));
  };

  const entries = Object.entries(peers);
  const stagePeers = entries.filter(([, p]) => p.sharing && p.streams.length > 0);
  const camPeers = entries.filter(([, p]) => !(p.sharing && p.streams.length > 0));
  const presenting = [
    ...(sharing ? ['Você'] : []),
    ...stagePeers.map(([, p]) => p.username),
  ];
  const anySharing = sharing || stagePeers.length > 0;

  const camTile = (key, videoEl, name, isMuted, volCtl) => (
    <div key={key} className="peer-tile">
      {videoEl}
      <div className="peer-bar">
        <span className="peer-name">{name} {isMuted && <MicOff size={12} />}</span>
        {volCtl}
      </div>
    </div>
  );

  return (
    <div className="voice-room">
      {shareSources && (
        <div className="modal-bg" onClick={() => chooseShareSource(null)}>
          <div className="share-picker" onClick={(e) => e.stopPropagation()}>
            <h3>Compartilhar sua tela</h3>
            <p>Escolha uma tela ou janela para transmitir na call.</p>
            <div className="share-grid">
              {shareSources.map((s) => (
                <button key={s.id} className="share-item" onClick={() => chooseShareSource(s)} title={s.name}>
                  {s.thumbnail
                    ? <img src={s.thumbnail} alt={s.name} />
                    : <div className="share-noimg">{s.screen ? '🖥' : '🪟'}</div>}
                  <span>{s.name.length > 28 ? s.name.slice(0, 28) + '…' : s.name}</span>
                </button>
              ))}
            </div>
            <button className="share-cancel" onClick={() => chooseShareSource(null)}>Cancelar</button>
          </div>
        </div>
      )}
      <h4>🔊 {channelName} — {status}
        {sharing && hw === true && <span className="hw-badge on">⚡ HW 1080p60</span>}
        {sharing && hw === false && <span className="hw-badge">SW</span>}
      </h4>
      {mediaNote && <div className="voice-note">{mediaNote}</div>}

      {anySharing ? (
        <>
          <div className="present-banner">
            <span className="live-dot" /> {presenting.join(', ')} {presenting.length > 1 ? 'estão' : 'está'} apresentando
          </div>
          <div className="present">
            <div className="present-main">
              {sharing && (
                <div className="stage-box live" data-fskey="own" ref={(el) => { if (el) stageBoxRefs.current.own = el; }}>
                  <video ref={screenPrevRef} autoPlay muted playsInline />
                  <span className="live-tag">AO VIVO</span>
                  <span className="stage-name">Sua tela</span>
                  <button className="fs-btn" title={fsId === 'own' ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => toggleFullscreen('own')}>
                    {fsId === 'own' ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              )}
              {stagePeers.map(([sid, p]) => (
                <div key={sid} className="stage-box live" data-fskey={sid} ref={(el) => { if (el) stageBoxRefs.current[sid] = el; }}>
                  {p.streams.map((st) => (
                    <PeerVideo key={st.id} stream={st} volume={p.volume} sinkId={outputDeviceId} />
                  ))}
                  <span className="live-tag">AO VIVO</span>
                  <span className="stage-name">{p.username} {p.muted && <MicOff size={12} />}</span>
                  <button className="fs-btn" title={fsId === sid ? 'Sair da tela cheia' : 'Tela cheia'} onClick={() => toggleFullscreen(sid)}>
                    {fsId === sid ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                </div>
              ))}
            </div>
            <div className="present-side">
              <div className="peer-tile mini local-tile">
                <video ref={localRef} autoPlay muted playsInline style={{ display: hasCam ? undefined : 'none' }} />
                {!hasCam && (
                  <div className="peer-empty">
                    <Avatar name="Você" size="md" />
                    <small>sem câmera</small>
                  </div>
                )}
                <div className="peer-bar">
                  <span className="peer-name">Você {muted && <MicOff size={12} />}</span>
                </div>
              </div>
              {camPeers.map(([sid, p]) => (
                <div key={sid} className="peer-tile mini">
                  {p.streams.length === 0 && (
                    <div className="peer-empty">
                      <span className="pulse"><Avatar name={p.username} size="md" /></span>
                      <small>conectando...</small>
                    </div>
                  )}
                  {p.streams.map((st) => (
                    <PeerVideo key={st.id} stream={st} volume={p.volume} sinkId={outputDeviceId} />
                  ))}
                  <div className="peer-bar">
                    <span className="peer-name">{p.username} {p.muted && <MicOff size={12} />}</span>
                    <label className="vol" title={`Volume de ${p.username}`}>
                      {p.volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                      <input
                        type="range" min="0" max="100" value={Math.round(p.volume * 100)}
                        onChange={(e) => setPeerVolume(sid, Number(e.target.value) / 100)}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="stage-label">Câmeras ({camPeers.length + 1})</div>
          <div className="cam-strip">
            <div className="peer-tile local-tile">
              <video ref={localRef} autoPlay muted playsInline style={{ display: hasCam ? undefined : 'none' }} />
              {!hasCam && (
                <div className="peer-empty">
                  <Avatar name="Você" size="md" />
                  <small>sem câmera</small>
                </div>
              )}
              <div className="peer-bar">
                <span className="peer-name">Você {muted && <MicOff size={12} />}</span>
              </div>
            </div>
            {camPeers.map(([sid, p]) => (
              <div key={sid} className="peer-tile">
                {p.streams.length === 0 && (
                  <div className="peer-empty">
                    <span className="pulse"><Avatar name={p.username} size="md" /></span>
                    <small>conectando...</small>
                  </div>
                )}
                {p.streams.map((st) => (
                  <PeerVideo key={st.id} stream={st} volume={p.volume} sinkId={outputDeviceId} />
                ))}
                <div className="peer-bar">
                  <span className="peer-name">{p.username} {p.muted && <MicOff size={12} />}</span>
                  <label className="vol" title={`Volume de ${p.username}`}>
                    {p.volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    <input
                      type="range" min="0" max="100" value={Math.round(p.volume * 100)}
                      onChange={(e) => setPeerVolume(sid, Number(e.target.value) / 100)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="voice-controls">
        <button onClick={toggleMute} className={muted ? 'danger' : ''} title="Mutar/desmutar">
          {muted ? <MicOff size={15} /> : <Mic size={15} />} {muted ? 'Desmutar' : 'Mutar'}
        </button>
        <label className="vol mic-vol" title="Volume de transmissão (microfone)">
          <Volume2 size={14} />
          <input type="range" min="0" max="150" value={micVol} onChange={(e) => changeMicVol(Number(e.target.value))} />
          <small>{micVol}%</small>
        </label>
        <button onClick={toggleCam} title="Câmera">{camOff ? <VideoOff size={15} /> : <Video size={15} />} Câmera</button>
        <button onClick={toggleShare} title="Compartilhar tela">{sharing ? <MonitorOff size={15} /> : <MonitorUp size={15} />} {sharing ? 'Parar tela' : 'Tela'}</button>
        {onLeave && <button onClick={onLeave} className="danger" title="Sair da call"><PhoneOff size={15} /> Sair</button>}
      </div>
    </div>
  );
}

function PeerVideo({ stream, volume = 1, sinkId }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (v && stream) {
      v.srcObject = stream;
      v.volume = volume;
      const play = () => v.play().catch(() => {});
      v.onloadedmetadata = play;
      play();
    }
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.volume = volume;
  }, [volume]);
  useEffect(() => {
    const v = ref.current;
    if (v && v.setSinkId) {
      v.setSinkId(sinkId || '').catch(() => {});
    }
  }, [sinkId]);
  return <video ref={ref} autoPlay playsInline />;
}
