// ================= CONFIG - GANTI DISINI =================
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw-58nnkja5GjCIlKhgujoOaOHwl6q5Db9vO8EbAL3U_taootpJe0RJIjLA0bzFiDdRYQ/exec', // GANTI DENGAN URL GAS ANDA
  COMPANY: 'PT SENTRA BHAKTI UTAMA',
  RADIUS_DEFAULT: 100,
  MAX_ACCURACY: 60,
  COOLDOWN_HOURS: 5,
  USE_MOCK_DATA: false // true = demo tanpa GAS, false = pakai GAS beneran
};

const LOKASI_DEFAULT = [
  {id_lokasi:'LOK001', nama_lokasi:'Kantor Pusat SBU Semarang', alamat:'Jl. Pemuda No.123 Semarang', latitude:-6.9667, longitude:110.42, radius_meter:150, status:'AKTIF'},
  {id_lokasi:'LOK002', nama_lokasi:'Gudang Industri Candi', alamat:'Kawasan Industri Candi Semarang', latitude:-6.987, longitude:110.39, radius_meter:200, status:'AKTIF'},
  {id_lokasi:'LOK003', nama_lokasi:'Perum Green Lake', alamat:'Cluster Green Lake Tangerang', latitude:-6.188, longitude:106.625, radius_meter:100, status:'AKTIF'}
];

// ===== STATE =====
let currentUser = JSON.parse(localStorage.getItem('sbu_user')||'null');
let selectedLokasi = JSON.parse(localStorage.getItem('sbu_lokasi')||'null');
let absenState = JSON.parse(localStorage.getItem('sbu_absen_state')||'{"lastMasuk":null,"lastPulang":null,"nextMasuk":null}');
let gps = null, watchId=null, mockSuspect=false, currentCameraMode=null, stream=null, capturedBase64=null;
let patroliData={foto1:'',foto2:''}, kejadianData={foto1:'',foto2:''}, ijinFoto='', ijinJenis='IJIN';

// ===== PWA INSTALL LOGIC =====
let deferredPrompt=null;
window.addEventListener('beforeinstallprompt', e=>{e.preventDefault(); deferredPrompt=e; const btn=document.getElementById('btnInstall'); if(btn) btn.classList.remove('hidden');});
function checkInstall(){
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const bypass = localStorage.getItem('sbu_bypass')=='1';
  if(!isStandalone && !bypass){
    const block=document.getElementById('installBlock');
    if(block) block.classList.remove('hidden');
    if(isIOS){
      const hint=document.getElementById('iosHint'); if(hint) hint.classList.remove('hidden');
      const btn=document.getElementById('btnInstall'); if(btn) btn.classList.add('hidden');
      const title=document.getElementById('installTitle'); if(title) title.innerText='Install di iPhone';
      const desc=document.getElementById('installDesc'); if(desc) desc.innerText='Tap Share > Add to Home Screen untuk install.';
    }
  } else {
    const block=document.getElementById('installBlock');
    if(block) block.classList.add('hidden');
  }
}
document.addEventListener('DOMContentLoaded', ()=>{
  const btn=document.getElementById('btnInstall');
  if(btn) btn.onclick = async ()=>{
    if(deferredPrompt){ deferredPrompt.prompt(); const {outcome}=await deferredPrompt.userChoice; if(outcome==='accepted'){ const block=document.getElementById('installBlock'); if(block) block.classList.add('hidden'); } }
  };
  checkInstall();
  // Register SW
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(()=>console.log('SW registered')).catch(e=>console.log('SW fail',e));
  }
  // Clock
  setInterval(()=>{const n=new Date(); const clockTop=document.getElementById('clockTop'); if(clockTop) clockTop.innerText=n.toLocaleTimeString('id-ID'); const camTime=document.getElementById('camTime'); if(camTime) camTime.innerText=n.toLocaleTimeString('id-ID');},1000);
  startGPS();
  if(currentUser && selectedLokasi) { const loginScreen=document.getElementById('screen-login'); if(loginScreen) loginScreen.classList.add('hidden'); showMainScreen(); }
  else if(currentUser) { const loginScreen=document.getElementById('screen-login'); if(loginScreen) loginScreen.classList.add('hidden'); showLokasiScreen(); }
});

// ===== GPS =====
function startGPS(){
  if(!navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(pos=>{
    const {latitude, longitude, accuracy, speed, altitude} = pos.coords;
    gps={lat:latitude,lng:longitude,accuracy,speed,altitude,timestamp:Date.now()};
    mockSuspect=false;
    if(accuracy===0 || accuracy>CONFIG.MAX_ACCURACY) mockSuspect=true;
    if(altitude===null && speed && speed>1) mockSuspect=true;
    const gpsInfo=document.getElementById('gpsInfo'); if(gpsInfo) gpsInfo.innerText=`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    const gpsAcc=document.getElementById('gpsAccuracy'); if(gpsAcc) gpsAcc.innerText=`Akurasi ${Math.round(accuracy)}m ${mockSuspect?'• MOCK SUSPECT':''}`;
    const gpsDot=document.getElementById('gpsDot'); if(gpsDot) gpsDot.className=`w-3 h-3 rounded-full ${accuracy<30?'bg-green-500':'bg-amber-500'} ${mockSuspect?'bg-red-500':''}`;
    const camGps=document.getElementById('camGps'); if(camGps) camGps.innerText=`${latitude.toFixed(5)},${longitude.toFixed(5)} • ${Math.round(accuracy)}m`;
    updateAbsenUI();
  }, err=>{
    const gpsInfo=document.getElementById('gpsInfo'); if(gpsInfo) gpsInfo.innerText='GPS Error: '+err.message;
  }, {enableHighAccuracy:true, timeout:10000, maximumAge:0});
}
function haversine(lat1,lon1,lat2,lon2){const R=6371e3; const toRad=x=>x*Math.PI/180; const dLat=toRad(lat2-lat1); const dLon=toRad(lon2-lon1); const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}

// ===== LOGIN =====
function doLogin(){
  const u=document.getElementById('inpUser').value.trim(), p=document.getElementById('inpPass').value;
  if(CONFIG.USE_MOCK_DATA){
    if((u==='satpam01'&&p==='123456')||(u==='admin'&&p==='admin123')){
      const user={username:u,nama:u==='admin'?'Admin SBU':'Budi Santoso',nik:u==='admin'?'ADM001':'SBU-00192',alamat:'Jl. Melati No.12, Semarang',no_tlp:'0812-8899-1122',email:`${u}@sbu.co.id`,role:u==='admin'?'admin':'satpam',avatar:u==='admin'?'AD':'BS'};
      localStorage.setItem('sbu_user',JSON.stringify(user)); currentUser=user; showLokasiScreen();
    } else { const el=document.getElementById('loginError'); el.innerText='Username / password salah (demo: satpam01 / 123456)'; el.classList.remove('hidden'); }
  } else {
    fetch(`${CONFIG.GAS_URL}?action=login&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`).then(r=>r.json()).then(res=>{ if(res.status==='success'){localStorage.setItem('sbu_user',JSON.stringify(res.user)); currentUser=res.user; showLokasiScreen();} else {const el=document.getElementById('loginError'); el.innerText=res.message; el.classList.remove('hidden');}});
  }
}
function showLokasiScreen(){
  document.getElementById('screen-login').classList.add('hidden');
  document.getElementById('screen-lokasi').classList.remove('hidden'); document.getElementById('screen-lokasi').classList.add('flex');
  const listEl=document.getElementById('listLokasi'); listEl.innerHTML='';
  const data = LOKASI_DEFAULT;
  data.forEach(l=>{
    const div=document.createElement('div'); div.className='bg-white dark:bg-slate-900 rounded-[20px] p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex items-center justify-between';
    div.innerHTML=`<div class="flex gap-3"><div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-building"></i></div><div><p class="font-bold text-[13px]">${l.nama_lokasi}</p><p class="text-[10px] text-slate-500">${l.alamat}</p><p class="text-[10px] mono text-slate-400">${l.latitude.toFixed(4)}, ${l.longitude.toFixed(4)} • ${l.radius_meter}m</p></div></div><button class="h-[36px] px-4 rounded-xl bg-[#0f172a] dark:bg-white dark:text-slate-900 text-white text-[11px] font-bold">PILIH</button>`;
    div.querySelector('button').onclick=()=>{selectedLokasi=l; localStorage.setItem('sbu_lokasi',JSON.stringify(l)); showMainScreen();};
    listEl.appendChild(div);
  });
}
function showMainScreen(){
  document.getElementById('screen-lokasi').classList.add('hidden');
  document.getElementById('screen-main').classList.remove('hidden'); document.getElementById('screen-main').classList.add('flex');
  document.getElementById('namaTop').innerText=currentUser.nama;
  document.getElementById('avatarTop').innerText=currentUser.avatar||currentUser.nama.substring(0,2).toUpperCase();
  document.getElementById('profilNama').innerText=currentUser.nama;
  document.getElementById('profilAvatar').innerText=currentUser.avatar||'BS';
  document.getElementById('profilNik').innerText=currentUser.nik||currentUser.username;
  document.getElementById('profilAlamat').innerText=currentUser.alamat||'-';
  document.getElementById('profilHp').innerText=currentUser.no_tlp||'-';
  document.getElementById('profilEmail').innerText=currentUser.email||'-';
  document.getElementById('profilLokasi').innerText=selectedLokasi?.nama_lokasi||'-';
  document.getElementById('lokasiTop').innerText=selectedLokasi?.nama_lokasi||'-';
  updateAbsenUI(); loadRekap(); loadInfo();
}
function doLogout(){localStorage.clear(); location.reload();}
function setTab(tab){
  document.querySelectorAll('[id^="tab-"]').forEach(el=>el.classList.add('hidden'));
  const target=document.getElementById('tab-'+tab); if(target) target.classList.remove('hidden');
  document.querySelectorAll('.tabBtn').forEach(b=>{b.className='tabBtn flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl text-slate-400';});
  const active=document.querySelector(`[data-tab="${tab}"]`); if(active) active.className='tabBtn flex-1 flex flex-col items-center gap-1 py-1.5 rounded-2xl bg-[#0f172a] text-white';
}
function updateAbsenUI(){
  if(!selectedLokasi||!gps){ const el=document.getElementById('absenJarak'); if(el) el.innerText='Menunggu GPS...'; return;}
  const jarak=haversine(gps.lat,gps.lng,selectedLokasi.latitude,selectedLokasi.longitude);
  const lokasiNama=document.getElementById('absenLokasiNama'); if(lokasiNama) lokasiNama.innerText=selectedLokasi.nama_lokasi;
  const jarakEl=document.getElementById('absenJarak'); if(jarakEl) jarakEl.innerText=`Jarak ${jarak.toFixed(0)}m dari lokasi (max ${selectedLokasi.radius_meter}m) ${jarak<=selectedLokasi.radius_meter?'✅':'❌ Diluar radius'}`;
  const latEl=document.getElementById('absenLat'); if(latEl) latEl.innerText=gps.lat.toFixed(5);
  const lngEl=document.getElementById('absenLng'); if(lngEl) lngEl.innerText=gps.lng.toFixed(5);
  const accEl=document.getElementById('absenAcc'); if(accEl) accEl.innerText=Math.round(gps.accuracy)+'m';
  const canAbsen = jarak<=selectedLokasi.radius_meter && !mockSuspect && gps.accuracy<=CONFIG.MAX_ACCURACY;
  const statusEl=document.getElementById('absenStatus');
  if(statusEl){ statusEl.innerText= canAbsen ? 'SIAP ABSEN' : mockSuspect ? 'FAKE GPS TERDETEKSI' : 'DILUAR RADIUS / GPS BURUK'; statusEl.className= canAbsen ? 'mt-1 inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-1 rounded-full' : 'mt-1 inline-block bg-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-full';}
  const now=Date.now();
  let masukEnabled=false, pulangEnabled=false;
  if(!absenState.lastMasuk){ masukEnabled=canAbsen; }
  else if(absenState.lastMasuk && !absenState.lastPulang){ pulangEnabled=canAbsen; }
  else if(absenState.lastPulang){ const next=absenState.nextMasuk||0; if(now>=next){ masukEnabled=canAbsen; absenState={lastMasuk:null,lastPulang:null,nextMasuk:null}; localStorage.setItem('sbu_absen_state',JSON.stringify(absenState)); } else { const sisa=Math.ceil((next-now)/1000/60); const box=document.getElementById('cooldownBox'); if(box) box.classList.remove('hidden'); const txt=document.getElementById('cooldownText'); if(txt) txt.innerText=`${Math.floor(sisa/60)} jam ${sisa%60} menit`; }}
  const btnMasuk=document.getElementById('btnMasuk'); if(btnMasuk) btnMasuk.disabled=!masukEnabled;
  const btnPulang=document.getElementById('btnPulang'); if(btnPulang) btnPulang.disabled=!pulangEnabled;
  if(absenState.lastMasuk){ const jamMasuk=document.getElementById('jamMasuk'); if(jamMasuk) jamMasuk.innerText=new Date(absenState.lastMasuk).toLocaleTimeString('id-ID'); }
  if(absenState.lastPulang){ const jamPulang=document.getElementById('jamPulang'); if(jamPulang) jamPulang.innerText=new Date(absenState.lastPulang).toLocaleTimeString('id-ID'); }
  const todayHist=JSON.parse(localStorage.getItem('sbu_absen_history')||'[]').filter(h=>new Date(h.timestamp).toDateString()===new Date().toDateString());
  const histEl=document.getElementById('todayHistory');
  if(histEl) histEl.innerHTML = todayHist.length ? todayHist.map(h=>`<div class="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full ${h.jenis==='MASUK'?'bg-green-100 text-green-600':'bg-red-100 text-red-600'} flex items-center justify-center"><i class="fa-solid ${h.jenis==='MASUK'?'fa-arrow-right-to-bracket':'fa-arrow-right-from-bracket'} text-[12px]"></i></div><div><p class="font-bold text-[12px]">${h.jenis} • ${new Date(h.timestamp).toLocaleTimeString('id-ID')}</p><p class="text-[10px] text-slate-500 mono">${h.lokasi}</p></div></div><span class="text-[10px] font-bold">${h.jarak}m</span></div>`).join('') : '<p class="text-[11px] text-slate-400 text-center py-4">Belum ada absensi hari ini</p>';
}

// ===== CAMERA =====
async function openCamera(mode){
  currentCameraMode=mode;
  const modal=document.getElementById('cameraModal'); if(modal){ modal.classList.remove('hidden'); modal.classList.add('flex'); }
  const title=document.getElementById('cameraTitle'); if(title) title.innerText=mode.toUpperCase();
  const btnCap=document.getElementById('btnCapture'); if(btnCap) btnCap.classList.remove('hidden');
  const btnUse=document.getElementById('btnUsePhoto'); if(btnUse) btnUse.classList.add('hidden');
  const captured=document.getElementById('capturedImg'); if(captured) captured.classList.add('hidden');
  const videoEl=document.getElementById('videoEl'); if(videoEl) videoEl.classList.remove('hidden');
  const facing = (mode==='masuk'||mode==='pulang')?'user':'environment';
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing, width:{ideal:1280}, height:{ideal:720}},audio:false});
    const video=document.getElementById('videoEl'); if(video){ video.srcObject=stream; }
    const loc = selectedLokasi?.nama_lokasi||'-';
    const camMark=document.getElementById('camMark'); if(camMark) camMark.innerText=`${new Date().toLocaleString('id-ID')} • ${loc}`;
    const camMark2=document.getElementById('camMark2'); if(camMark2) camMark2.innerText=`${currentUser.nama} • ${gps?gps.lat.toFixed(5)+','+gps.lng.toFixed(5):'-'} • ${mode.toUpperCase()}`;
  }catch(e){alert('Kamera tidak bisa diakses: '+e.message);}
}
function closeCamera(){ if(stream) stream.getTracks().forEach(t=>t.stop()); const modal=document.getElementById('cameraModal'); if(modal) modal.classList.add('hidden'); capturedBase64=null;}
function capturePhoto(){
  const video=document.getElementById('videoEl'); const canvas=document.getElementById('canvasEl'); const ctx=canvas.getContext('2d');
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  ctx.drawImage(video,0,0);
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(0, canvas.height-90, canvas.width, 90);
  ctx.fillStyle='#f59e0b'; ctx.font='bold 14px Inter'; ctx.fillText('PT SENTRA BHAKTI UTAMA',16,canvas.height-68);
  ctx.fillStyle='white'; ctx.font='11px monospace'; 
  ctx.fillText(`${new Date().toLocaleString('id-ID')} • ${selectedLokasi?.nama_lokasi||''}`,16,canvas.height-48);
  ctx.fillText(`${currentUser.nama} • ${gps?gps.lat.toFixed(5)+','+gps.lng.toFixed(5)+' • '+Math.round(gps.accuracy)+'m':''} • ${currentCameraMode.toUpperCase()}`,16,canvas.height-28);
  ctx.fillText(`Lat: ${gps?.lat.toFixed(6)||'-'} Lng: ${gps?.lng.toFixed(6)||'-'} • ${mockSuspect?'MOCK SUSPECT':''}`,16,canvas.height-12);
  capturedBase64=canvas.toDataURL('image/jpeg',0.7);
  const capturedImg=document.getElementById('capturedImg'); if(capturedImg){ capturedImg.src=capturedBase64; capturedImg.classList.remove('hidden'); }
  const videoEl=document.getElementById('videoEl'); if(videoEl) videoEl.classList.add('hidden');
  const btnCap=document.getElementById('btnCapture'); if(btnCap) btnCap.classList.add('hidden');
  const btnUse=document.getElementById('btnUsePhoto'); if(btnUse) btnUse.classList.remove('hidden');
}
function usePhoto(){
  if(!capturedBase64) return;
  if(currentCameraMode==='masuk'||currentCameraMode==='pulang'){ submitAbsen(currentCameraMode, capturedBase64); }
  else if(currentCameraMode==='patroli1'){ patroliData.foto1=capturedBase64; const prev=document.getElementById('patroliFoto1Prev'); if(prev){ prev.src=capturedBase64; prev.classList.remove('hidden'); } const label=document.getElementById('patroliFoto1Label'); if(label) label.innerText='FOTO 1 ✅'; }
  else if(currentCameraMode==='patroli2'){ patroliData.foto2=capturedBase64; const prev=document.getElementById('patroliFoto2Prev'); if(prev){ prev.src=capturedBase64; prev.classList.remove('hidden'); } const label=document.getElementById('patroliFoto2Label'); if(label) label.innerText='FOTO 2 ✅'; }
  else if(currentCameraMode==='kejadian1'){ kejadianData.foto1=capturedBase64; const prev=document.getElementById('kejadianFoto1Prev'); if(prev){ prev.src=capturedBase64; prev.classList.remove('hidden'); } const label=document.getElementById('kejadianFoto1Label'); if(label) label.innerText='BUKTI 1 ✅'; }
  else if(currentCameraMode==='kejadian2'){ kejadianData.foto2=capturedBase64; const prev=document.getElementById('kejadianFoto2Prev'); if(prev){ prev.src=capturedBase64; prev.classList.remove('hidden'); } const label=document.getElementById('kejadianFoto2Label'); if(label) label.innerText='BUKTI 2 ✅'; }
  else if(currentCameraMode==='ijin'){ ijinFoto=capturedBase64; const label=document.getElementById('ijinFotoLabel'); if(label) label.innerText='FOTO BUKTI ✅ Terlampirkan'; }
  closeCamera();
}
function submitAbsen(jenis, fotoBase64){
  if(!gps) {alert('GPS belum siap'); return;}
  const payload={action: jenis==='masuk'?'absenMasuk':'absenPulang', username:currentUser.username, nama:currentUser.nama, id_lokasi:selectedLokasi.id_lokasi, nama_lokasi:selectedLokasi.nama_lokasi, jenis:jenis.toUpperCase(), latitude:gps.lat, longitude:gps.lng, accuracy:gps.accuracy, is_mock:mockSuspect, foto_base64:fotoBase64, timemark:new Date().toLocaleString('id-ID')};
  if(CONFIG.USE_MOCK_DATA){
    const hist=JSON.parse(localStorage.getItem('sbu_absen_history')||'[]'); hist.push({timestamp:Date.now(), jenis:jenis.toUpperCase(), lokasi:selectedLokasi.nama_lokasi, jarak:haversine(gps.lat,gps.lng,selectedLokasi.latitude,selectedLokasi.longitude).toFixed(0)}); localStorage.setItem('sbu_absen_history',JSON.stringify(hist));
    if(jenis==='masuk'){ absenState.lastMasuk=Date.now(); } else { absenState.lastPulang=Date.now(); absenState.nextMasuk=Date.now()+CONFIG.COOLDOWN_HOURS*3600*1000; }
    localStorage.setItem('sbu_absen_state',JSON.stringify(absenState)); alert(`Absen ${jenis.toUpperCase()} berhasil! (Mock Mode)`); closeCamera(); updateAbsenUI();
  } else {
    fetch(CONFIG.GAS_URL,{method:'POST', body:JSON.stringify(payload)}).then(r=>r.json()).then(res=>{ if(res.status==='success'){ alert(res.message); if(jenis==='masuk') absenState.lastMasuk=Date.now(); else {absenState.lastPulang=Date.now(); absenState.nextMasuk=Date.now()+CONFIG.COOLDOWN_HOURS*3600*1000;} localStorage.setItem('sbu_absen_state',JSON.stringify(absenState)); closeCamera(); updateAbsenUI(); } else alert(res.message);});
  }
}
function submitPatroli(){
  const lokasi=document.getElementById('patroliLokasi').value, ket=document.getElementById('patroliKet').value;
  if(!lokasi||!ket||!patroliData.foto1||!patroliData.foto2) {alert('Lengkapi lokasi, keterangan, dan 2 foto bukti'); return;}
  const payload={action:'patroli', username:currentUser.username, id_lokasi:selectedLokasi.id_lokasi, nama_lokasi:selectedLokasi.nama_lokasi, lokasi_patroli:lokasi, keterangan:ket, latitude:gps.lat, longitude:gps.lng, foto1_base64:patroliData.foto1, foto2_base64:patroliData.foto2, timemark:new Date().toLocaleString('id-ID')};
  if(CONFIG.USE_MOCK_DATA){ alert('Patroli terkirim (Mock)'); document.getElementById('patroliLokasi').value=''; document.getElementById('patroliKet').value=''; patroliData={foto1:'',foto2:''}; const p1=document.getElementById('patroliFoto1Prev'); if(p1) p1.classList.add('hidden'); const p2=document.getElementById('patroliFoto2Prev'); if(p2) p2.classList.add('hidden'); }
  else { fetch(CONFIG.GAS_URL,{method:'POST', body:JSON.stringify(payload)}).then(r=>r.json()).then(res=>alert(res.message)); }
}
function submitKejadian(){
  const jenis=document.getElementById('kejadianJenis').value, lokasi=document.getElementById('kejadianLokasi').value, krono=document.getElementById('kejadianKrono').value;
  if(!lokasi||!krono||!kejadianData.foto1||!kejadianData.foto2) {alert('Lengkapi semua field dan 2 foto bukti'); return;}
  const payload={action:'kejadian', username:currentUser.username, jenis_kejadian:jenis, lokasi_kejadian:lokasi, kronologi:krono, latitude:gps.lat, longitude:gps.lng, foto1_base64:kejadianData.foto1, foto2_base64:kejadianData.foto2, timemark:new Date().toLocaleString('id-ID')};
  if(CONFIG.USE_MOCK_DATA){ alert('Laporan kejadian terkirim (Mock)'); }
  else { fetch(CONFIG.GAS_URL,{method:'POST', body:JSON.stringify(payload)}).then(r=>r.json()).then(res=>alert(res.message)); }
}
function loadRekap(){
  const monthEl=document.getElementById('rekapBulan'); if(!monthEl) return; monthEl.value=new Date().toISOString().slice(0,7);
  monthEl.onchange=()=>renderRekap(monthEl.value);
  renderRekap(monthEl.value);
}
function renderRekap(bulan){
  const all=JSON.parse(localStorage.getItem('sbu_absen_history')||'[]').filter(h=>{const d=new Date(h.timestamp); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`===bulan;});
  const listEl=document.getElementById('rekapList'); if(!listEl) return;
  listEl.innerHTML = all.length ? all.map(h=>`<div class="bg-white dark:bg-slate-900 rounded-2xl p-3 flex justify-between items-center"><div><p class="font-bold text-[12px]">${new Date(h.timestamp).toLocaleDateString('id-ID')} • ${h.jenis}</p><p class="text-[10px] text-slate-500">${h.lokasi}</p></div><span class="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">${new Date(h.timestamp).toLocaleTimeString('id-ID')}</span></div>`).join('') : '<p class="text-center text-[11px] text-slate-400 py-8">Tidak ada data di bulan ini</p>';
}
function setInfoTab(t){
  const gaji=document.getElementById('info-gaji'), shift=document.getElementById('info-shift'), ijin=document.getElementById('info-ijin');
  if(gaji) gaji.classList.add('hidden'); if(shift) shift.classList.add('hidden'); if(ijin) ijin.classList.add('hidden');
  const btnGaji=document.getElementById('infoBtnGaji'), btnShift=document.getElementById('infoBtnShift'), btnIjin=document.getElementById('infoBtnIjin');
  if(btnGaji) btnGaji.className='flex-1 h-[36px] rounded-xl text-slate-500 text-[11px] font-bold';
  if(btnShift) btnShift.className='flex-1 h-[36px] rounded-xl text-slate-500 text-[11px] font-bold';
  if(btnIjin) btnIjin.className='flex-1 h-[36px] rounded-xl text-slate-500 text-[11px] font-bold';
  if(t==='gaji'){ if(gaji) gaji.classList.remove('hidden'); if(btnGaji) btnGaji.className='flex-1 h-[36px] rounded-xl bg-[#0f172a] text-white text-[11px] font-bold';}
  if(t==='shift'){ if(shift) shift.classList.remove('hidden'); if(btnShift) btnShift.className='flex-1 h-[36px] rounded-xl bg-[#0f172a] text-white text-[11px] font-bold';}
  if(t==='ijin'){ if(ijin) ijin.classList.remove('hidden'); if(btnIjin) btnIjin.className='flex-1 h-[36px] rounded-xl bg-[#0f172a] text-white text-[11px] font-bold';}
}
function setIjinJenis(j){ ijinJenis=j; const btnIjin=document.getElementById('ijinBtnIjin'), btnSakit=document.getElementById('ijinBtnSakit'); if(btnIjin) btnIjin.className=j==='IJIN'?'flex-1 h-[40px] rounded-xl bg-[#0f172a] text-white text-[11px] font-bold':'flex-1 h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold'; if(btnSakit) btnSakit.className=j==='SAKIT'?'flex-1 h-[40px] rounded-xl bg-red-600 text-white text-[11px] font-bold':'flex-1 h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold';}
function loadInfo(){
  const gajiEl=document.getElementById('info-gaji'); if(gajiEl) gajiEl.innerHTML='<div class="bg-white dark:bg-slate-900 rounded-[24px] p-4"><h3 class="font-bold text-[12px]">Slip Gaji</h3><div class="mt-3 space-y-2"><div class="flex justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-xl"><span class="text-[11px]">Juni 2025 - Rp 4.200.000</span><button class="text-[10px] font-bold text-amber-600">DOWNLOAD</button></div></div></div>';
}
function submitShift(){
  const tgl=document.getElementById('shiftTgl').value, lama=document.getElementById('shiftLama').value, baru=document.getElementById('shiftBaru').value, pengganti=document.getElementById('shiftPengganti').value, alasan=document.getElementById('shiftAlasan').value;
  if(!tgl||!pengganti) return alert('Lengkapi tanggal dan pengganti');
  const data={tanggal:tgl, lama, baru, pengganti, alasan, status:'PENDING'};
  const list=JSON.parse(localStorage.getItem('sbu_shift')||'[]'); list.push(data); localStorage.setItem('sbu_shift',JSON.stringify(list)); alert('Pengajuan tukar shift dikirim, menunggu approval admin');
}
function submitIjin(){
  const mulai=document.getElementById('ijinMulai').value, selesai=document.getElementById('ijinSelesai').value, ket=document.getElementById('ijinKet').value;
  if(!mulai||!ket||!ijinFoto) return alert('Lengkapi tanggal, keterangan, dan foto bukti');
  const data={jenis:ijinJenis, mulai, selesai, ket, status:'PENDING'}; const list=JSON.parse(localStorage.getItem('sbu_ijin')||'[]'); list.push(data); localStorage.setItem('sbu_ijin',JSON.stringify(list)); alert(`Pengajuan ${ijinJenis} dikirim`);
}
