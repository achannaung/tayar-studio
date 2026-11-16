/* ================= project save / load (V2) ================= */
function exportProject(){
  const data={app:'tayar-studio',version:2,settings:{},presets:presets,srt:srt.cues.length?{name:srt.name,text:srt.raw}:null};
  SETTINGS.forEach(k=>data.settings[k]=state[k]);
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  downloadURL(url,baseName()+'-project.json');
  setTimeout(()=>URL.revokeObjectURL(url),20000);
  toast('Project JSON ထုတ်ပြီးပါပြီ — ဒီဇိုင်း + SRT ပါဝင်သည်',{type:'success',icon:'save'});
}
async function importProject(file){
  if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    if(!data||data.app!=='tayar-studio')throw new Error('bad file');
    if(data.settings)SETTINGS.forEach(k=>{if(k in data.settings&&typeof data.settings[k]===typeof DEFAULTS[k])state[k]=data.settings[k];});
    if(Array.isArray(data.presets))presets=data.presets.filter(p=>p&&p.name&&p.data).slice(0,6);
    if(data.srt&&data.srt.text){
      const cues=parseSRT(data.srt.text);
      if(cues.length){srt.name=data.srt.name||'project.srt';srt.cues=cues;srt.raw=data.srt.text;srtIdx=0;idbSet('srt',{name:srt.name,text:srt.raw});}
    }
    makeMote();wrapCache.clear();updateDims();setCanvasSize(state.quality);
    renderCustomPresets();syncAll();saveSoon();
    toast('Project ပြန်တင်ပြီးပါပြီ',{type:'success',icon:'save'});
  }catch(e){toast('Project ဖိုင် ဖတ်၍မရပါ — tayar-studio JSON ဟုတ်မဟုတ် စစ်ပါ',{type:'danger'});}
}
document.getElementById('btnSaveProject').addEventListener('click',exportProject);
document.getElementById('btnLoadProject').addEventListener('click',()=>document.getElementById('fileProject').click());
document.getElementById('fileProject').addEventListener('change',e=>{importProject(e.target.files[0]);e.target.value='';});

/* ================= export ================= */
state.recording=false;
let recMode='',recorder=null,recChunks=[],recURL=null,recCancelled=false,recDest=null,recStream=null,recTimer=null,recFileName='',visWarned=false;
let muxerLib=null;
function loadMuxer(){
  if(muxerLib)return Promise.resolve(muxerLib);
  return import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm').then(m=>{muxerLib=m;return m;});
}
function pickMime(preferMp4){
  if(typeof MediaRecorder==='undefined')return '';
  const mp4=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/mp4'];
  const webm=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const cand=preferMp4?mp4.concat(webm):webm.concat(mp4);
  for(const m of cand){try{if(MediaRecorder.isTypeSupported(m))return m;}catch(e){}}
  return '';
}
function downloadURL(url,name){
  const a=document.createElement('a');a.href=url;a.download=name;
  document.body.appendChild(a);a.click();a.remove();
}
function openModal(mode,title,sub,note){
  $('mRec').hidden=false;$('mDone').hidden=true;
  $('mTitle').textContent=title;
  $('mSub').textContent=sub;
  $('mMode').textContent=mode;
  $('mNote').textContent=note;
  $('mPct').textContent='0%';$('ringFg').style.strokeDashoffset='339.292';
  $('modal').classList.add('open');
  $('btnCancelRec').focus();
}
function closeModal(){$('modal').classList.remove('open');$('btnExportTop').focus();}
function setLock(on){
  document.body.classList.toggle('recording',on);
  $('panel').classList.toggle('locked',on);
  $('recBadge').hidden=!on;
  $('frameTools').hidden=on||!media.sp;
  $('spHint').classList.toggle('off',on||!media.sp);
  syncExportButtons();
}
function setProgress(p,cur,dur){
  $('ringFg').style.strokeDashoffset=String(339.292*(1-clamp(p,0,1)));
  $('mPct').textContent=Math.round(p*100)+'%';
  $('mTime').textContent=fmtT(cur)+' / '+fmtT(dur);
  $('recTime').textContent=fmtT(cur);
}
function baseName(){return (state.title||'dhamma-talk').replace(/[\\/:*?"<>|]/g,'').trim()||'dhamma-talk';}
async function verifyExport(blob,ext,el){
  try{
    if(blob.size<20000){el.textContent='⚠ ဖိုင်အရွယ် အလွန်သေးသည် — export မပြည့်စုံနိုင်ပါ';return;}
    const url=URL.createObjectURL(blob);
    const v=document.createElement('video');v.preload='metadata';v.muted=true;
    await new Promise((res,rej)=>{const to=setTimeout(()=>rej(new Error('timeout')),9000);
      v.onloadedmetadata=()=>{clearTimeout(to);res(true);};
      v.onerror=()=>{clearTimeout(to);rej(new Error('load'));};
      v.src=url;});
    const exp=RC.dur||audioEl.duration||0,got=v.duration||0;
    URL.revokeObjectURL(url);
    if(exp&&Math.abs(got-exp)>Math.max(2,exp*0.03))el.textContent='⚠ စစ်ဆေးချက်: ဗီဒီယိုအရှည် '+fmtT(got)+' — အသံအရှည် '+fmtT(exp)+' နဲ့ ကွာနေသည်။ preview ဖွင့်၍ စစ်ပါ';
    else el.textContent='✓ စစ်ဆေးပြီး — အရှည် '+fmtT(got)+'၊ အသံအရှည်နဲ့ ကိုက်ညီသည်။ အသံကြားရမှု preview မှာ ထပ်စစ်ပါ';
  }catch(e){el.textContent='⚠ ဖိုင်ကို ပြန်ဖတ်၍ စစ်ဆေး၍မရပါ — player နဲ့ စမ်းကြည့်ပါ';}
}
function showDone(blob,ext){
  if(recURL)URL.revokeObjectURL(recURL);
  recURL=URL.createObjectURL(blob);
  recFileName=baseName()+'-'+state.exportRes+'p.'+ext;
  downloadURL(recURL,recFileName);
  $('mRec').hidden=true;$('mDone').hidden=false;
  $('mFile').textContent=recFileName;
  $('mSize').textContent=(blob.size/1048576).toFixed(1)+' MB • '+state.exportRes+'p • '+ext.toUpperCase()+' • '+fmtT(RC.dur||audioEl.duration);
  const pv=$('mPreview');if(pv){pv.src=recURL;pv.hidden=false;}
  const vf=$('mVerify');if(vf){vf.textContent='စစ်ဆေးနေသည်…';verifyExport(blob,ext,vf);}
  $('btnCloseDone').focus();
  toast('ဗီဒီယို ဒေါင်းလုဒ် ပြီးပါပြီ ('+ext.toUpperCase()+')',{type:'success',dur:6000});
}
function videoBitrate(){
  const d=audioEl.duration||0;
  const base=state.exportRes>=1080?8e6:4.5e6;
  if(d>1800)return Math.round(base*0.45);
  if(d>900)return Math.round(base*0.6);
  if(d>300)return Math.round(base*0.8);
  return base;
}
const nextFrame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const tick=()=>new Promise(r=>setTimeout(r,0));

async function startExport(){
  if(state.recording)return;
  if(!media.audioURL){toast('အသံဖိုင် အရင် တင်ပေးပါ',{type:'warn'});return;}
  ensureAudio();
  const durA=audioEl.duration||0;
  if(durA>1800&&!confirm('အသံက '+fmtT(durA)+' ရှည်ပါသည်။ အမြန် MP4 export က memory အများကြီး သုံးနိုင်ပြီး ဖုန်းမှာ crash ဖြစ်နိုင်သည်။ ဆက်လုပ်မလား? (Export 720p ရွေးထားရင် ပိုစိတ်ချရသည်)'))return;
  if(state.format==='mp4'&&window.VideoEncoder&&window.AudioEncoder){
    try{await startOfflineMP4();return;}
    catch(e){
      if(recCancelled){cleanupOffline();return;}
      toast('MP4 အမြန်နည်း မရပါ — အချိန်နှင့်တစ်ပြေးညီ နည်းသို့ ပြောင်းသည်',{type:'warn',dur:6000});
      cleanupOffline();
    }
  }
  startRealtime(state.format==='mp4');
}
function cleanupOffline(){
  state.recording=false;recMode='';
  RC.offline=false;RC.mono=null;
  setLock(false);setCanvasSize(state.quality);
  if(recCancelled)closeModal();
}

/* ---- Tier 1: WebCodecs offline MP4 ---- */
async function startOfflineMP4(){
  const mux=await loadMuxer();
  const ab=await (await fetch(media.audioURL)).arrayBuffer();
  if(!AC)throw new Error('no AC');
  const buf=await AC.decodeAudioData(ab.slice(0));
  const dur=buf.duration,sr=buf.sampleRate,ch=Math.min(2,buf.numberOfChannels);
  const mono=new Float32Array(buf.length);
  for(let c=0;c<buf.numberOfChannels;c++){
    const d=buf.getChannelData(c);
    for(let i=0;i<buf.length;i++)mono[i]+=d[i]/buf.numberOfChannels;
  }
  setCanvasSize(state.exportRes);
  const W=cv.width,H=cv.height,fps=30;
  const pick=await pickExportCodecs(sr,ch);
  if(!pick)throw new Error('no codecs');
  const vCodec=pick.v,vKind=pick.vKind,aCfg=pick.aCfg,aKind=pick.aKind;

  state.recording=true;recMode='offline';recCancelled=false;visWarned=false;
  setLock(true);
  openModal('MP4 • '+(vKind==='avc'?'H.264':'VP9')+' + '+(aKind==='aac'?'AAC':'Opus')+' • အမြန် Encode','MP4 ဗီဒီယို ဖန်တီးနေပါသည်…',
    'အသံအရှည်ထက် မြန်အောင် frame များကို တိုက်ရိုက် encode လုပ်နေသည်',
    aKind==='opus'?'ဤတက်ဘ်ကို ဖွင့်ထားပါ။ အသံကို Opus ဖြင့် encode ထားသည် — YouTube တွင် အပြည့်အဝ အလုပ်လုပ်သည်၊ ဖုန်း gallery player အချို့တွင် အသံ မကြားရနိုင်ပါ (VLC ဖြင့် ဖွင့်နိုင်သည်)။':'ဤတက်ဘ်ကို ဖွင့်ထားပါ။ မူရင်းအသံ အပြည့်အဝ ပါဝင်ပြီး စာတန်းထိုးများလည်း အချိန်ကိုက် ပါဝင်မည်။');
  setCanvasSize(state.exportRes);
  await nextFrame();

  const muxer=new mux.Muxer({
    target:new mux.ArrayBufferTarget(),
    video:{codec:vKind,width:cv.width,height:cv.height,frameRate:fps},
    audio:{codec:aKind,sampleRate:sr,numberOfChannels:ch},
    fastStart:'in-memory',
    firstTimestampBehavior:'offset'
  });
  let encErr=null;
  const vEnc=new VideoEncoder({
    output:(chunk,meta)=>muxer.addVideoChunk(chunk,meta),
    error:e=>{encErr=e;}
  });
  const vCfg={codec:vCodec,width:cv.width,height:cv.height,bitrate:videoBitrate(),framerate:fps,
    latencyMode:'quality',hardwareAcceleration:'prefer-hardware'};
  if(vKind==='avc')vCfg.avc={format:'avc'};
  vEnc.configure(vCfg);
  const aEnc=new AudioEncoder({
    output:(chunk,meta)=>muxer.addAudioChunk(chunk,meta),
    error:e=>{encErr=e;}
  });
  aEnc.configure(aCfg);

  RC.offline=true;RC.mono=mono;RC.sr=sr;RC.dur=dur;
  $('mSub').textContent='အသံ encode လုပ်နေသည်…';
  sm.fill(0);srtIdx=0;

  try{
    /* audio */
    const chunkN=4096;
    for(let s=0;s<buf.length;s+=chunkN){
      if(recCancelled||encErr)throw new Error('abort');
      const n=Math.min(chunkN,buf.length-s);
      const data=new Float32Array(n*ch);
      for(let c=0;c<ch;c++)data.set(buf.getChannelData(c).subarray(s,s+n),c*n);
      const ad=new AudioData({format:'f32-planar',sampleRate:sr,numberOfFrames:n,numberOfChannels:ch,
        timestamp:Math.round(s/sr*1e6),data});
      aEnc.encode(ad);ad.close();
      if(aEnc.encodeQueueSize>8)await tick();
    }
    $('mSub').textContent='ဗီဒီယို frame များ encode လုပ်နေသည်…';
    /* video */
    const total=Math.max(1,Math.ceil(dur*fps));
    const t0=performance.now();
    for(let i=0;i<total;i++){
      if(i===180){
        const el=(performance.now()-t0)/1000;
        if(el>(180/fps)*0.95)throw new Error('slow-encoder');
      }
      if(recCancelled||encErr)throw new Error('abort');
      RC.time=i/fps;
      drawFrame(i/fps,1/fps);
      const vf=new VideoFrame(cv,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});
      vEnc.encode(vf,{keyFrame:i%90===0});
      vf.close();
      while(vEnc.encodeQueueSize>6)await tick();
      if(i%12===0){setProgress(i/total,i/fps,dur);await nextFrame();}
    }
    await vEnc.flush();await aEnc.flush();
    if(recCancelled||encErr)throw new Error('abort');
    muxer.finalize();
    const blob=new Blob([muxer.target.buffer],{type:'video/mp4'});
    vEnc.close();aEnc.close();
    state.recording=false;recMode='';
    RC.offline=false;RC.mono=null;
    setLock(false);setCanvasSize(state.quality);
    setProgress(1,dur,dur);
    if(!blob.size)throw new Error('empty');
    showDone(blob,'mp4');
  }catch(e){
    try{vEnc.close();}catch(err){}
    try{aEnc.close();}catch(err){}
    if(recCancelled){
      cleanupOffline();
      toast('မှတ်တမ်းတင်ခြင်း ပယ်ဖျက်ပြီးပါပြီ',{type:'info'});
      return;
    }
    throw e;
  }
}

/* ---- Tier 2: MediaRecorder realtime ---- */
async function startRealtime(preferMp4){
  const mime=pickMime(preferMp4);
  if(!mime||!cv.captureStream){toast('ဤဘရောက်ဆာတွင် ဗီဒီယိုမှတ်တမ်း မထောက်ပံ့ပါ — Chrome / Edge သုံးပါ',{type:'danger',dur:7000});return;}
  if(!AC){toast('အသံစနစ် မရရှိပါ — စာမျက်နှာ ပြန်ဖွင့်ပြီး ထပ်စမ်းပါ',{type:'danger'});return;}
  try{await AC.resume();}catch(e){}
  const isMp4=mime.includes('mp4');
  if(preferMp4&&!isMp4)toast('ဤဘရောက်ဆာတွင် MP4 မှတ်တမ်း မရပါ — WebM ဖြင့် ထုတ်ပေးမည်',{type:'warn',dur:6000});
  state.recording=true;recMode='realtime';recCancelled=false;recChunks=[];visWarned=false;
  setLock(true);
  openModal(isMp4?'MP4 • အချိန်နှင့်တစ်ပြေးညီ':'WebM • အချိန်နှင့်တစ်ပြေးညီ','ဗီဒီယို ဖန်တီးနေပါသည်…',
    'မြင်ကွင်း + အသံလှိုင်း + စာတန်းထိုး + တရားတော်အသံ တစ်ပါတည်း မှတ်တမ်းတင်နေသည်',
    'အသံအရှည်အတိုင်း အမှန်တကယ်အချိန်ဖြင့် မှတ်တမ်းတင်နေသဖြင့် ဤတက်ဘ်ကို ဖွင့်ထားပါ။ အသံထွက်ပမာဏသည် ကြိုကြည့်ရန်သာဖြစ်ပြီး ဗီဒီယိုတွင် မူရင်းအသံ အပြည့်ပါဝင်သည်။');
  setCanvasSize(state.exportRes);
  await nextFrame();
  try{
    recDest=AC.createMediaStreamDestination();
    analyser.connect(recDest);
    recStream=cv.captureStream(30);
    recDest.stream.getAudioTracks().forEach(tr=>recStream.addTrack(tr));
    recorder=new MediaRecorder(recStream,{mimeType:mime,
      videoBitsPerSecond:videoBitrate(),audioBitsPerSecond:192e3});
    recorder.ondataavailable=e=>{if(e.data&&e.data.size)recChunks.push(e.data);};
    recorder.onerror=()=>{recCancelled=true;try{recorder.stop();}catch(e){finishRec();}};
    recorder.onstop=finishRec;
    audioEl.currentTime=0;
    recorder.start(1000);
    try{await audioEl.play();}
    catch(e){recCancelled=true;try{recorder.stop();}catch(e2){finishRec();}}
    const dur=audioEl.duration;
    if(dur&&isFinite(dur))recTimer=setTimeout(()=>{if(state.recording)stopRec();},(dur+2)*1000);
  }catch(e){
    recCancelled=true;
    try{if(recorder&&recorder.state!=='inactive')recorder.stop();else finishRec();}
    catch(e2){finishRec();}
    toast('မှတ်တမ်းစတင်၍မရပါ — ထပ်မံစမ်းကြည့်ပါ',{type:'danger'});
  }
}
function stopRec(){
  if(recMode==='offline'){recCancelled=true;return;}
  if(recorder&&recorder.state!=='inactive'){try{recorder.stop();}catch(e){finishRec();}}
}
function finishRec(){
  if(!state.recording||recMode!=='realtime')return;
  clearTimeout(recTimer);
  if(recStream)recStream.getVideoTracks().forEach(tr=>{try{tr.stop();}catch(e){}});
  try{if(recDest)analyser.disconnect(recDest);}catch(e){}
  recDest=null;recStream=null;
  audioEl.pause();
  state.recording=false;recMode='';
  setLock(false);
  setCanvasSize(state.quality);
  if(recCancelled){
    closeModal();recorder=null;
    toast('မှတ်တမ်းတင်ခြင်း ပယ်ဖျက်ပြီးပါပြီ',{type:'info'});
    return;
  }
  const mime=(recorder&&recorder.mimeType)||'video/webm';
  const blob=new Blob(recChunks,{type:mime.split(';')[0]});
  recorder=null;
  if(!blob.size){closeModal();toast('ဗီဒီယိုဒေတာ မရရှိပါ — ထပ်မံစမ်းကြည့်ပါ',{type:'danger'});return;}
  showDone(blob,mime.includes('mp4')?'mp4':'webm');
}
function updateRecUI(){
  const dur=audioEl.duration||0,cur=audioEl.currentTime||0;
  setProgress(dur?cur/dur:0,cur,dur);
}
function exportThumb(){
  if(state.recording)return;
  setCanvasSize(1080);
  drawFrame(RC.time||performance.now()/1000,0);
  let url;
  try{url=cv.toDataURL('image/png');}
  catch(e){setCanvasSize(state.quality);toast('Thumbnail ထုတ်၍မရပါ',{type:'danger'});return;}
  setCanvasSize(state.quality);
  downloadURL(url,baseName()+'-thumbnail.png');
  toast('Thumbnail ('+(state.aspect==='portrait'?'1080×1920':'1920×1080')+' PNG) ဒေါင်းလုဒ် ဆွဲပြီးပါပြီ',{type:'success'});
}

/* ================= main loop ================= */
let last=performance.now(),uiAcc=0;
function loop(now){
  const t=now/1000;
  let dt=(now-last)/1000;last=now;
  dt=clamp(dt,0,0.05);
  if(!RC.offline){
    RC.time=audioEl.currentTime||0;
    RC.dur=audioEl.duration||0;
  }
  drawFrame(t,dt);
  if(!seekDrag&&media.audioURL&&audioEl.duration){
    const sk=$('seek');
    sk.value=String(Math.round(audioEl.currentTime/audioEl.duration*1000));
    paintRange(sk);
  }
  uiAcc+=dt;
  if(uiAcc>0.2){
    uiAcc=0;
    $('tCur').textContent=fmtT(audioEl.currentTime);
    $('tDur').textContent=fmtT(audioEl.duration);
    const sn=$('subNow');
    if(!srt.cues.length){sn.textContent='ဖိုင် မတင်ရသေးပါ';sn.classList.remove('live');}
    else if(!state.showSubs){sn.textContent='စာတန်းထိုး ပိတ်ထားသည်';sn.classList.remove('live');}
    else if(lastCueText){sn.textContent=lastCueText;sn.classList.add('live');}
    else{sn.textContent='— လက်ရှိအချိန်တွင် စာတန်းမရှိပါ —';sn.classList.remove('live');}
    if(state.recording&&recMode==='realtime')updateRecUI();
  }
  requestAnimationFrame(loop);
}

/* ================= init ================= */
function flash(el){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1300);}
function init(){
  buildFallbackBG();buildPlaceholderSp();makeMote();makeNoise();initParticles();
  restore();buildThemeChips();buildSwatches();
  buildTextSwatches('swTitle','colTitle','titleColor');
  buildTextSwatches('swName','colName','nameColor');

  bindText('inTitle','title');bindText('inName','speakerName');bindText('inChannel','channel');
  bindCheck('tgText','showText');bindCheck('tgBreath','speakerBreath');bindCheck('tgZoom','bgZoom');bindCheck('tgSubs','showSubs');
  bindRange('rgTitleSize','titleSize','oTitleSize',v=>'×'+v.toFixed(2),()=>wrapCache.clear());
  bindRange('rgNameSize','nameSize','oNameSize',v=>'×'+v.toFixed(2),()=>wrapCache.clear());
  bindRange('rgLogoSize','logoSize','oLogoSize',v=>'×'+v.toFixed(2));
  bindRange('rgWHeight','waveHeight','oWHeight',v=>'×'+v.toFixed(2));
  bindRange('rgWCount','waveCount','oWCount',v=>String(Math.round(v)));
  bindRange('rgWGlow','waveGlow','oWGlow',pct);
  bindRange('rgWSmooth','waveSmooth','oWSmooth',pct);
  bindRange('rgSpSize','speakerSize','oSpSize',v=>'×'+v.toFixed(2));
  bindRange('rgSpZoom','spZoom','oSpZoom',v=>'×'+v.toFixed(2));
  bindRange('rgSpX','spImgX','oSpX',v=>String(Math.round(v*100)));
  bindRange('rgSpY','spImgY','oSpY',v=>String(Math.round(v*100)));
  bindRange('rgSubSize','subSize','oSubSize',v=>'×'+v.toFixed(2),()=>wrapCache.clear());
  bindRange('rgDark','bgDark','oDark',pct);
  bindRange('rgBlur','bgBlur','oBlur',v=>Math.round(v)+'px');
  bindRange('rgVig','vignette','oVig',pct);
  bindRange('rgParts','particles','oParts',v=>String(Math.round(v)));
  bindRange('vol','volume','oVol',pct,()=>applyGain());
  bindColor('colW1','waveColor1');bindColor('colW2','waveColor2');
  bindColor('colTitle','titleColor',false);bindColor('colName','nameColor',false);
  seg('segWave','waveStyle');seg('segSpPos','speakerPos');seg('segSpFrame','speakerFrame');
  seg('segAspect','aspect',()=>{updateDims();if(!state.recording)setCanvasSize(state.quality);});
  bindRange('rgSubShift','subShift','oSubShift',v=>(v>0?'+':'')+v.toFixed(1)+'s');
  bindColor('colSub','subColor',false);
  bindRange('rgSubBg','subBg','oSubBg',pct);
  bindCheck('tgTitleIntro','titleIntro');
  bindCheck('tgBranding','showBranding');
  updateCodecBadge();
  bindSelect('selQuality','quality',v=>{if(!state.recording)setCanvasSize(v);});
  bindSelect('selRes','exportRes');
  bindSelect('selFormat','format',()=>syncExportButtons());

  [['selTitleFont','titleFont'],['selNameFont','nameFont']].forEach(pr=>{
    $(pr[0]).addEventListener('change',e=>{
      state[pr[1]]=e.target.value;wrapCache.clear();syncFontPreviews();saveSoon();
    });
  });
  syncers.push(()=>{
    if(!fontExists(state.titleFont))state.titleFont='padauk';
    if(!fontExists(state.nameFont))state.nameFont='padauk';
    $('selTitleFont').value=state.titleFont;$('selNameFont').value=state.nameFont;
    syncFontPreviews();
  });

  $('btnPlay').addEventListener('click',togglePlay);
  $('btnMute').addEventListener('click',toggleMute);
  $('btnMuteMini').addEventListener('click',toggleMute);
  const sk=$('seek');
  sk.addEventListener('pointerdown',()=>seekDrag=true);
  window.addEventListener('pointerup',()=>seekDrag=false);
  sk.addEventListener('input',()=>{
    paintRange(sk);
    if(audioEl.duration)audioEl.currentTime=sk.value/1000*audioEl.duration;
  });

  $('btnAdjust').addEventListener('click',()=>setAdjust(!adjustMode));
  $('btnSpZoomIn').addEventListener('click',()=>spZoomBy(1.15));
  $('btnSpZoomOut').addEventListener('click',()=>spZoomBy(0.87));
  $('btnSpReset').addEventListener('click',spReset);

  $('fileBg').addEventListener('change',e=>{handleImage(e.target.files[0],'bg');e.target.value='';});
  $('fileSp').addEventListener('change',e=>{handleImage(e.target.files[0],'sp');e.target.value='';});
  $('fileLogo').addEventListener('change',e=>{handleImage(e.target.files[0],'logo');e.target.value='';});
  $('fileAu').addEventListener('change',e=>{handleAudioFile(e.target.files[0]);e.target.value='';});
  $('fileSrt').addEventListener('change',e=>{handleSrtFile(e.target.files[0]);e.target.value='';});
  $('fileFont').addEventListener('change',e=>{handleFontFiles(e.target.files);e.target.value='';});
  [['rmBg','bg'],['rmSp','sp'],['rmLogo','logo'],['rmAu','au'],['rmSrt','srt']].forEach(pr=>{
    $(pr[0]).addEventListener('click',e=>{e.preventDefault();e.stopPropagation();removeMedia(pr[1]);});
  });
  const dropRoute=(file)=>{
    if(!file)return;
    if(/\.(ttf|otf|woff2?)$/i.test(file.name)||(file.type||'').startsWith('font/'))handleFontFiles([file]);
    else if(/\.(srt|vtt)$/i.test(file.name))handleSrtFile(file);
    else if(file.type.startsWith('audio/'))handleAudioFile(file);
    else if(file.type.startsWith('image/'))handleImage(file,'bg');
    else toast('ပုံ / အသံ / ဖောင့် / SRT ဖိုင်သာ လက်ခံပါသည်',{type:'warn'});
  };
  [['tileBg','bg'],['tileSp','sp'],['tileLogo','logo'],['tileAu','au'],['tileSrt','srt'],['tileFont','font']].forEach(pr=>{
    const tile=$(pr[0]);
    tile.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();tile.classList.add('drag');});
    tile.addEventListener('dragleave',()=>tile.classList.remove('drag'));
    tile.addEventListener('drop',e=>{
      e.preventDefault();e.stopPropagation();tile.classList.remove('drag');
      const f=e.dataTransfer.files[0];
      if(pr[1]==='au')handleAudioFile(f);
      else if(pr[1]==='srt')handleSrtFile(f);
      else if(pr[1]==='font')handleFontFiles(e.dataTransfer.files);
      else handleImage(f,pr[1]);
    });
  });
  $('frame').addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();});
  $('frame').addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();dropRoute(e.dataTransfer.files[0]);});
  window.addEventListener('dragover',e=>e.preventDefault());
  window.addEventListener('drop',e=>{if(e.defaultPrevented)return;e.preventDefault();dropRoute(e.dataTransfer.files[0]);});

  $('btnExport').addEventListener('click',startExport);
  $('btnExportTop').addEventListener('click',startExport);
  $('btnThumb').addEventListener('click',exportThumb);
  $('btnThumbTop').addEventListener('click',exportThumb);
  $('btnCancelRec').addEventListener('click',()=>{recCancelled=true;stopRec();});
  $('btnCloseDone').addEventListener('click',closeModal);
  $('btnAgain').addEventListener('click',()=>{if(recURL)downloadURL(recURL,recFileName);});
  $('modal').addEventListener('click',e=>{if(e.target===$('modal')&&!state.recording)closeModal();});

  $('btnReset').addEventListener('click',()=>{
    Object.assign(state,JSON.parse(JSON.stringify(DEFAULTS)));
    makeMote();wrapCache.clear();setCanvasSize(state.quality);applyGain();
    syncAll();saveSoon();
    toast('မူလဒီဇိုင်း ပြန်ထားပြီးပါပြီ',{type:'success'});
  });
  $('btnRandom').addEventListener('click',()=>{
    applyTheme(pickArr(Object.keys(THEMES)));
    state.waveStyle=pickArr(['bars','mirror','line','ring']);
    state.speakerPos=pickArr(['left','center','right']);
    state.speakerFrame=pickArr(['gold','lotus','thin']);
    state.particles=30+5*Math.floor(Math.random()*20);
    state.waveGlow=+(0.4+Math.random()*0.6).toFixed(2);
    state.waveHeight=+(0.7+Math.random()*0.8).toFixed(2);
    state.bgDark=+(0.35+Math.random()*0.35).toFixed(2);
    state.vignette=+(0.3+Math.random()*0.4).toFixed(2);
    state.speakerSize=+(0.85+Math.random()*0.4).toFixed(2);
    state.titleSize=+(0.85+Math.random()*0.5).toFixed(2);
    state.nameSize=+(0.85+Math.random()*0.4).toFixed(2);
    syncAll();saveSoon();
    toast('ကျပန်းဒီဇိုင်း ဖန်တီးပြီးပါပြီ',{type:'gold',icon:'dice'});
  });
  $('btnSavePreset').addEventListener('click',()=>{
    const data={};PRESET_KEYS.forEach(k=>data[k]=state[k]);
    const name=(state.title||'ဒီဇိုင်း').trim().slice(0,14)||'ဒီဇိုင်း';
    presets.push({name,data});
    if(presets.length>6)presets.shift();
    renderCustomPresets();saveSoon();
    toast('«'+name+'» ဒီဇိုင်း သိမ်းပြီးပါပြီ',{type:'success',icon:'save'});
  });
  $('step1').addEventListener('click',()=>{const el=$('tileAu');el.scrollIntoView({behavior:'smooth',block:'center'});flash(el);});
  $('step2').addEventListener('click',()=>{const el=$('cardText');el.scrollIntoView({behavior:'smooth',block:'center'});flash(el);});
  $('step3').addEventListener('click',startExport);

  window.addEventListener('keydown',e=>{
    const tag=(e.target.tagName||'').toUpperCase();
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT')return;
    if(e.code==='Space'){e.preventDefault();togglePlay();}
    else if(e.code==='KeyM')toggleMute();
    else if(e.code==='Escape'&&$('modal').classList.contains('open')){
      if(state.recording){recCancelled=true;stopRec();}else closeModal();
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&state.recording&&!visWarned){
      visWarned=true;
      toast('တက်ဘ်ကို ဖွင့်ထားပါ — ဗီဒီယိုဖရိမ်းများ ရပ်တန့်နိုင်သည်',{type:'warn',dur:7000});
    }
  });
  window.addEventListener('beforeunload',e=>{
    if(state.recording){e.preventDefault();e.returnValue='';}
  });

  const io=new IntersectionObserver(es=>es.forEach(en=>{
    if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target);}
  }),{threshold:0.1});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  if(document.fonts&&document.fonts.load){
    Promise.all([
      document.fonts.load('700 80px Padauk','မေတ္တာသုတ်တရားတော်'),
      document.fonts.load('500 40px "Noto Sans Myanmar"','ဆရာတော်'),
      document.fonts.load('700 80px "Noto Serif Myanmar"','မေတ္တာသုတ်'),
      document.fonts.load('80px "Myanmar Angoun"','မေတ္တာသုတ်တရားတော်'),
      document.fonts.load('700 80px "Myanmar Angoun"','မေတ္တာသုတ်တရားတော်'),
      document.fonts.load('80px "Myanmar Black"','မေတ္တာသုတ်'),
      document.fonts.load('80px "Myanmar Waso"','မေတ္တာသုတ်'),
      document.fonts.load('80px "Pangram"','မေတ္တာသုတ်'),
      document.fonts.load('80px "Myanmar Yein"','မေတ္တာသုတ်')
    ]).then(()=>{fontsReady=true;wrapCache.clear();}).catch(()=>{});
  }

  setCanvasSize(state.quality);
  rebuildFontSelects();renderFontChips();
  renderCustomPresets();
  syncAll();
  applyGain();
  restoreFonts();
  restoreSRT();
  restoreMedia();

  makeDemoAudio().then(url=>{
    if(!media.userAu&&!media.audioURL)setAudio(url,'နမူနာ — ကြေးခေါင်းလောင်း သံစဉ်',true,false);
  }).catch(()=>{
    toast('နမူနာအသံ မဖန်တီးနိုင်ပါ — မိမိအသံဖိုင် တင်၍ စတင်ပါ',{type:'info',dur:6000});
  });

  requestAnimationFrame(loop);
}
init();
