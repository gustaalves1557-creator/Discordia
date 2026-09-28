import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, MonitorUp, MonitorOff, Volume2, VolumeX, PhoneOff, Maximize2, Minimize2, Headphones } from 'lucide-react';
import { getVoiceSettings, subscribeVoiceSettings, micMeter } from '../voiceStore';
import { Avatar } from './Chat';

// Sala de voz + compartilhamento de tela (sem câmera) via WebRTC mesh.
// - Maior socket.id inicia a oferta (sem glare)
// - Mic com ganho + gate de sensibilidade + medidor
// - Ping de cada pessoa medido e compartilhado na sala
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

function audioConstraints(cfg) {
  return {
    deviceId: cfg.inputDeviceId ? { exact: cfg.inputDeviceId } : undefined,
    noiseSuppression: cfg.noiseSuppression,
    echoCancellation: cfg.echoCancellation,
    autoGainControl: cfg.autoGain,
  };
}

export function Ping({ ms }) {
  if (ms == null) return <span className="ping p-unknown">--</span>;
  const cls = ms < 150 ? 'p-good' : ms < 300 ? 'p-mid' : 'p-bad';
  return <span className={`ping ${cls}`}>{ms}ms</span>;
}

export default function Voice({ channelId, channelName, socket, onLeave }) {
  const [peers, setPeers] = useState({}); // socketId -> { username, streams: [], muted, sharing, volume, ping }
  const [muted, setMuted] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [micVol, setMicVol] = useState(100);
  const [status, setStatus] = useState('Conectando...');
  const [mediaNote, setMediaNote] = useState('');
  const [hw, setHw] = useState(null);
  const [ownPing, setOwnPing] = useState(null);
  const [hasMic, setHasMic] = useState(true);
  const [outputDeviceId, setOutputDeviceId] = useState(getVoiceSettings().outputDeviceId || '');
  const [shareSources, setShareSources] = useState(null);
  const [fsId, setFsId] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [deafened, setDeafened] = useState(false);
  const [speakingSelf, setSpeakingSelf] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState({});
  const shareResolve = useRef(null);
  const stageBoxRefs = useRef({});
  const streamRef = useRef(null); // só áudio
  const screenRef = useRef(null); // tela
  const screenPrevRef = useRef(null); // prévia da própria tela
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
  const prevVolsRef = useRef(null);
  const prevMutedRef = useRef(false);
  const peerAnalysers = useRef({});
  const analysisCtxRef = useRef(null);

  const patchPeer = (sid, patch) => {
    setPeers((prev) => {
      const cur = prev[sid] || { username: names.current[sid] || '?', streams: [], muted: false, sharing: false, volume: 1, ping: null };
      return { ...prev, [sid]: { ...cur, ...patch } };
    });
  };

  useEffect(() => {
    let dead = false;
    let meterTimer = null;
    let pingTimer = null;
    let speakTimer = null;
    let gateSmooth = 1;
    myId.current = socket.id;
    const cfg0 = getVoiceSettings();
    setOutputDeviceId(cfg0.outputDeviceId || '');

    const remember = (sid, username) => {
      if (username) names.current[sid] = username;
      setPeers((prev) => (prev[sid] ? prev : { ...prev, [sid]: { username: names.current[sid] || '?', streams: [], muted: false, sharing: false, volume: 1, ping: null } }));
    };

    const ensurePC = (peerId) => {
      if (pcs.current[peerId]) return pcs.current[peerId];
      const pc = new RTCPeerConnection(ICE);
      pcs.current[peerId] = pc;
      const mic = micTrackRef.current;
      if (mic) {
        pc.addTrack(mic, mic._stream || undefined);
      } else {
        try { pc.addTransceiver('audio', { direction: 'recvonly' }); } catch {}
      }
      // vídeo só recebe (telas compartilhadas); nunca enviamos câmera
      try { pc.addTransceiver('video', { direction: 'recvonly' }); } catch {}
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
        // analisador p/ indicador "falando"
        try {
          let actx = audioCtxRef.current || analysisCtxRef.current;
          if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) { actx = new AC(); analysisCtxRef.current = actx; }
          }
          if (actx) {
            const rsrc = actx.createMediaStreamSource(stream);
            const ran = actx.createAnalyser();
            ran.fftSize = 512;
            rsrc.connect(ran);
            peerAnalysers.current[peerId] = { analyser: ran, buf: new Uint8Array(ran.fftSize), src: rsrc };
          }
        } catch {}
        setPeers((prev) => {
          const cur = prev[peerId] || { username: names.current[peerId] || '?', streams: [], muted: false, sharing: false, volume: 1, ping: null };
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
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
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
      try { peerAnalysers.current[socketId]?.src.disconnect(); } catch {}
      delete peerAnalysers.current[socketId];
      setSpeakingPeers((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
      setPeers((prev) => { const n = { ...prev }; delete n[socketId]; return n; });
    };
    const onPeerMute = ({ socketId, muted: m }) => patchPeer(socketId, { muted: m });
    const onPeerSharing = ({ socketId, sharing: sh }) => patchPeer(socketId, { sharing: sh });
    const onPong = ({ t }) => {
      if (dead || typeof t !== 'number') return;
      const rtt = Date.now() - t;
      setOwnPing(rtt);
      try { socket.emit('voice:stats', { channelId, ping: rtt }); } catch {}
    };
    const onPeerStats = ({ socketId, ping }) => patchPeer(socketId, { ping });

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
          setSpeakingSelf((prev) => {
            const v = !mutedRef.current && lvl > (cfg.sensThreshold || 0) + 8;
            return prev === v ? prev : v;
          });
          const cfg = getVoiceSettings();
          const now = Date.now();
          if (lvl >= (cfg.sensThreshold || 0)) lastVoice = now;
          let target = Math.max(0, Math.min(2, micVolRef.current / 100));
          if (mutedRef.current) target = 0;
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
        setMediaNote('');
        setHasMic(true);
      } catch {
        if (!dead) setMediaNote('Não foi possível trocar o microfone/filtro.');
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
      if (next.hwAccel !== prev.hwAccel && screenRef.current) {
        for (const pc of Object.values(pcs.current)) {
          const sc = screenRef.current;
          const sender = sc && pc.getSenders().find((x) => sc.getVideoTracks().includes(x.track));
          if (sender) tuneScreenSender(sender, sender.track, next.hwAccel !== false);
        }
      }
    });

    async function init() {
      socket.on('voice:peers', onPeers);
      socket.on('voice:peer-join', onPeerJoin);
      socket.on('voice:signal', onSignal);
      socket.on('voice:peer-leave', onPeerLeave);
      socket.on('voice:peer-mute', onPeerMute);
      socket.on('voice:peer-sharing', onPeerSharing);
      socket.on('voice:pong', onPong);
      socket.on('voice:peer-stats', onPeerStats);

      const cfg = getVoiceSettings();
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(cfg) });
      } catch {
        if (!dead) {
          setMediaNote('Sem microfone: você entrou só ouvindo. Libere a permissão para falar.');
          setStatus('Na chamada (só ouvindo)');
          setHasMic(false);
        }
      }
      if (dead) { stream?.getTracks().forEach((t) => t.stop()); return; }
      if (stream?.getAudioTracks().length) {
        streamRef.current = stream;
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          const ctx = new AC();
          await ctx.resume().catch(() => {});
          audioCtxRef.current = ctx;
          buildGraph(ctx, stream);
        } catch {}
      } else if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        if (!dead) setHasMic(false);
      }

      socket.emit('voice:join', { channelId, muted: false });
      // mede o ping a cada 3s
      pingTimer = setInterval(() => {
        if (dead) return;
        try { socket.emit('voice:ping', { t: Date.now() }); } catch {}
      }, 3000);
      try { socket.emit('voice:ping', { t: Date.now() }); } catch {}
      // indicador "falando" dos outros (4x por segundo)
      speakTimer = setInterval(() => {
        if (dead) return;
        const next = {};
        for (const [sid, a] of Object.entries(peerAnalysers.current)) {
          try {
            a.analyser.getByteTimeDomainData(a.buf);
            let sum = 0;
            for (let i = 0; i < a.buf.length; i++) {
              const v = (a.buf[i] - 128) / 128;
              sum += v * v;
            }
            next[sid] = Math.sqrt(sum / a.buf.length) > 0.06;
          } catch {}
        }
        setSpeakingPeers((prev) => {
          const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
          for (const k of keys) if (!!prev[k] !== !!next[k]) return next;
          return prev;
        });
      }, 250);
      if (!dead) setStatus((s) => (s === 'Conectando...' ? 'Na chamada' : s));
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('Erro');
      setMediaNote('Este navegador não suporta voz (use Chrome/Edge ou o app desktop).');
    } else {
      init();
    }

    return () => {
      dead = true;
      unsub();
      if (meterTimer) clearInterval(meterTimer);
      if (pingTimer) clearInterval(pingTimer);
      if (speakTimer) clearInterval(speakTimer);
      micMeter.level = 0;
      for (const a of Object.values(peerAnalysers.current)) { try { a.src.disconnect(); } catch {} }
      peerAnalysers.current = {};
      try { analysisCtxRef.current?.close(); } catch {}
      analysisCtxRef.current = null;
      try { socket.emit('voice:leave', { channelId }); } catch {}
      socket.off('voice:peers', onPeers);
      socket.off('voice:peer-join', onPeerJoin);
      socket.off('voice:signal', onSignal);
      socket.off('voice:peer-leave', onPeerLeave);
      socket.off('voice:peer-mute', onPeerMute);
      socket.off('voice:peer-sharing', onPeerSharing);
      socket.off('voice:pong', onPong);
      socket.off('voice:peer-stats', onPeerStats);
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

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    const raw = streamRef.current?.getAudioTracks()[0];
    if (raw) raw.enabled = !next;
    setMuted(next);
    try { socket.emit('voice:mute', { channelId, muted: next }); } catch {}
  };
  // surdez: zera todo mundo + muta o mic; ao sair, restaura
  const toggleDeafen = () => {
    if (!deafened) {
      prevVolsRef.current = Object.fromEntries(Object.entries(peers).map(([sid, p]) => [sid, p.volume]));
      prevMutedRef.current = mutedRef.current;
      setPeers((prev) => {
        const n = {};
        for (const [sid, p] of Object.entries(prev)) n[sid] = { ...p, volume: 0 };
        return n;
      });
      if (!mutedRef.current) toggleMute();
      setDeafened(true);
    } else {
      const pv = prevVolsRef.current || {};
      setPeers((prev) => {
        const n = { ...prev };
        for (const sid of Object.keys(pv)) if (n[sid]) n[sid] = { ...n[sid], volume: pv[sid] };
        return n;
      });
      if (!prevMutedRef.current && mutedRef.current) toggleMute();
      setDeafened(false);
    }
  };
  const changeMicVol = (v) => {
    setMicVol(v);
    micVolRef.current = v;
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
        if (!picked) return;
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
        try {
          pc.addTrack(track, sc);
          const sender = pc.getSenders().find((x) => x.track === track);
          if (sender) await tuneScreenSender(sender, track, hwOn);
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
    for (const pc of Object.values(pcs.current)) {
      try {
        pc.getSenders()
          .filter((x) => sc?.getVideoTracks().includes(x.track))
          .forEach((sender) => { try { pc.removeTrack(sender); } catch {} });
      } catch {}
    }
    setSharing(false);
    try { socket.emit('voice:sharing', { channelId, sharing: false }); } catch {}
  };

  const setPeerVolume = (sid, v) => {
    setPeers((prev) => (prev[sid] ? { ...prev, [sid]: { ...prev[sid], volume: v } } : prev));
  };

  const openCtx = (e, sid) => {
    e.preventDefault();
    setCtxMenu({ sid, x: Math.min(e.clientX, window.innerWidth - 220), y: Math.min(e.clientY, window.innerHeight - 160) });
  };

  const entries = Object.entries(peers);
  const stagePeers = entries.filter(([, p]) => p.sharing && p.streams.length > 0);
  const voicePeers = entries.filter(([, p]) => !(p.sharing && p.streams.length > 0));
  const presenting = [
    ...(sharing ? ['Você'] : []),
    ...stagePeers.map(([, p]) => p.username),
  ];
  const anySharing = sharing || stagePeers.length > 0;

  const chip = (key, name, isMuted, ping, sid, speaking) => (
    <div key={key} className="vchip" onContextMenu={sid ? (e) => openCtx(e, sid) : undefined} title={sid ? 'Botão direito: volume' : name}>
      <Avatar name={name} size="sm" speaking={speaking} />
      <span className="nm">{name}</span>
      {isMuted ? <MicOff size={12} className="muted-ic" /> : <Mic size={12} className="unmuted-ic" />}
      <Ping ms={ping} />
    </div>
  );

  return (
    <div className="voice-room v2">
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
      <div className="vcall-bar">
        <span className="live-dot" />
        <b>Na call</b>
        <span className="vcall-chan">#{channelName}</span>
        <span className="vcall-status">{status}</span>
        <Ping ms={ownPing} />
        {sharing && hw === true && <span className="hw-badge on">⚡ HW</span>}
        {sharing && hw === false && <span className="hw-badge">SW</span>}
        <span className="vcall-count" title="Na call">{entries.length + 1}</span>
        {onLeave && <button className="vcall-x" title="Sair da call" onClick={onLeave}><PhoneOff size={14} /></button>}
      </div>
      {mediaNote && <div className="voice-note">{mediaNote}</div>}

      {anySharing ? (
        <>
          <div className="present-hint">
            <span className="live-tag static">AO VIVO</span>
            {presenting.join(', ')} {presenting.length > 1 ? 'estão' : 'está'} apresentando
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
              {chip('me', hasMic ? 'Você' : 'Você (ouvindo)', muted || deafened, ownPing, null, speakingSelf)}
              {voicePeers.map(([sid, p]) => chip(sid, p.username, p.muted, p.ping, sid, speakingPeers[sid]))}
            </div>
          </div>
        </>
      ) : (
        <div className="vcall-chips">
          {chip('me', hasMic ? 'Você' : 'Você (ouvindo)', muted || deafened, ownPing, null, speakingSelf)}
          {voicePeers.map(([sid, p]) => chip(sid, p.username, p.muted, p.ping, sid, speakingPeers[sid]))}
        </div>
      )}

      <div className="voice-controls slim">
        <button onClick={toggleMute} className={muted ? 'danger' : ''} title="Mutar/desmutar">
          {muted ? <MicOff size={15} /> : <Mic size={15} />} {muted ? 'Desmutar' : 'Mutar'}
        </button>
        <button onClick={toggleDeafen} className={deafened ? 'danger' : ''} title="Ensudecer (silencia tudo)">
          <Headphones size={15} /> {deafened ? 'Ouvir' : 'Surdez'}
        </button>
        <label className="vol mic-vol" title="Volume de transmissão (microfone)">
          <Volume2 size={14} />
          <input type="range" min="0" max="150" value={micVol} onChange={(e) => changeMicVol(Number(e.target.value))} />
          <small>{micVol}%</small>
        </label>
        <button onClick={toggleShare} title="Compartilhar tela">{sharing ? <MonitorOff size={15} /> : <MonitorUp size={15} />} {sharing ? 'Parar tela' : 'Tela'}</button>
        {onLeave && <button onClick={onLeave} className="danger" title="Sair da call"><PhoneOff size={15} /> Sair</button>}
      </div>
      {ctxMenu && peers[ctxMenu.sid] && (
        <>
          <div className="ctx-overlay" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <b>{peers[ctxMenu.sid].username}</b>
            <label className="vol">
              {peers[ctxMenu.sid].volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
              <input
                type="range" min="0" max="100" value={Math.round(peers[ctxMenu.sid].volume * 100)}
                onChange={(e) => setPeerVolume(ctxMenu.sid, Number(e.target.value) / 100)}
              />
              <small>{Math.round(peers[ctxMenu.sid].volume * 100)}%</small>
            </label>
            <button onClick={() => { setPeerVolume(ctxMenu.sid, peers[ctxMenu.sid].volume === 0 ? 1 : 0); setCtxMenu(null); }}>
              {peers[ctxMenu.sid].volume === 0 ? 'Ativar som' : 'Silenciar'}
            </button>
          </div>
        </>
      )}
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
