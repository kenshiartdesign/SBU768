
const CONFIG={GAS_URL:'https://script.google.com/macros/s/AKfycbw-58nnkja5GjCIlKhgujoOaOHwl6q5Db9vO8EbAL3U_taootpJe0RJIjLA0bzFiDdRYQ/exec',USE_MOCK_DATA:true,RADIUS_DEFAULT:150,MAX_ACCURACY:60,COOLDOWN_HOURS:5};
const LOKASI_DEFAULT=[{id_lokasi:'LOK001',nama_lokasi:'Kantor Pusat SBU Semarang',alamat:'Jl. Pemuda No.123 Semarang',latitude:-6.9667,longitude:110.42,radius_meter:150},{id_lokasi:'LOK002',nama_lokasi:'Gudang Industri Candi',alamat:'Kawasan Industri Candi Semarang',latitude:-6.987,longitude:110.39,radius_meter:200}];
let currentUser=JSON.parse(localStorage.getItem('sbu_user')||'null');let selectedLokasi=JSON.parse(localStorage.getItem('sbu_lokasi')||'null');let absenState=JSON.parse(localStorage.getItem('sbu_absen_state')||'{"lastMasuk":null}');let gps=null,deferredPrompt=null,installReady=false;
let patroliData={foto1:'',foto2:''},kejadianData={foto1:'',foto2:''},currentCameraMode=null,stream=null,capturedBase64=null;

function logStatus(t){const el=document.getElementById('pwaStatus');if(el)el.textContent+=(t+'\n');console.log('[PWA] '+t);}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}

window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredPrompt=e;installReady=true;
  logStatus('✅ READY: beforeinstallprompt fired - tombol bisa install');
  const badge=document.getElementById('installBadge');if(badge){badge.textContent='✅ Siap Install';badge.className='text-[10px] bg-green-500 text-white px-2 py-1 rounded-full';}
  const btn=document.getElementById('btnInstall');if(btn){btn.textContent='📲 INSTALL SEKARANG (SIAP)';btn.disabled=false;btn.classList.remove('opacity-50');}
});

window.addEventListener('appinstalled',()=>{
  logStatus('✅ App terinstall!');
  localStorage.setItem('sbu_installed','1');
  document.getElementById('installBlock').classList.add('hidden');
});

function checkInstall(){
  const bypass=localStorage.getItem('sbu_bypass')==='1';
  const installed=localStorage.getItem('sbu_installed')==='1';
  logStatus('Check: standalone='+isStandalone()+' bypass='+bypass+' installed='+installed+' https='+(location.protocol==='https:'));
  const block=document.getElementById('installBlock');
  if(isStandalone()||installed||bypass){block.classList.add('hidden');logStatus('→ Block hidden (sudah install/bypass)');return;}
  block.classList.remove('hidden');
  logStatus('→ Install block ditampilkan');
  // cek manifest & icon
  fetch('./manifest.json').then(r=>logStatus(r.ok?'✅ manifest.json OK':'❌ manifest gagal '+r.status)).catch(e=>logStatus('❌ manifest error '+e));
  // cek SW
  if(!('serviceWorker' in navigator)) logStatus('❌ SW tidak support');
  else logStatus('✅ SW supported');
  // setelah 3 detik jika belum ready, beri info fallback
  setTimeout(()=>{
    if(!installReady){
      logStatus('⚠️ beforeinstallprompt belum fire (normal di awal). Klik Install tetap bisa pakai cara manual. Atau klik Lanjutkan di Browser untuk testing.');
      const badge=document.getElementById('installBadge');if(badge){badge.textContent='⚠️ Manual';badge.className='text-[10px] bg-amber-500 text-white px-2 py-1 rounded-full';}
    }
  },3000);
}

function setupButtons(){
  const btn=document.getElementById('btnInstall');
  const btnCont=document.getElementById('btnContinue');
  if(btn){
    btn.onclick=async()=>{
      logStatus('Tombol Install diklik, ready='+installReady+' hasPrompt='+!!deferredPrompt);
      if(deferredPrompt){
        deferredPrompt.prompt();
        const choice=await deferredPrompt.userChoice;
        logStatus('User pilih: '+choice.outcome);
        if(choice.outcome==='accepted'){
          document.getElementById('installBlock').classList.add('hidden');
          localStorage.setItem('sbu_installed','1');
        }
        deferredPrompt=null;
      }else{
        // FALLBACK MANUAL - SELALU BISA DIKLIK
        const ua=navigator.userAgent;
        const isAndroid=/Android/.test(ua);
        const isIOS=/iPhone|iPad|iPod/.test(ua);
        if(isIOS){
          alert('iPhone:\n1. Tap ikon Share di bawah (kotak panah)\n2. Pilih Add to Home Screen\n3. Tap Add\n\nSetelah itu buka dari Home Screen');
        }else if(isAndroid){
          alert('Install Manual Android:\n\n1. Tap titik 3 (⋮) kanan atas Chrome\n2. Pilih "Install app" atau "Tambahkan ke layar utama"\n\nJika tidak ada:\n- Pastikan buka pakai Chrome (bukan FB/IG browser)\n- Klik Lanjutkan di Browser dulu, lalu coba lagi\n\nAtau pakai tombol Lanjutkan di Browser untuk testing sekarang');
        }else{
          alert('Install Desktop:\n\n- Cari ikon Install di kanan address bar\n- Atau Menu Chrome (⋮) > Simpan dan bagikan > Install\n\nAtau klik Lanjutkan di Browser untuk testing');
        }
      }
    };
  }
  if(btnCont){
    btnCont.onclick=()=>{
      logStatus('Lanjutkan di Browser diklik');
      localStorage.setItem('sbu_bypass','1');
      document.getElementById('installBlock').classList.add('hidden');
    };
  }
  const btnReset=document.getElementById('btnReset');
  if(btnReset){btnReset.onclick=()=>{localStorage.clear();location.reload();};}
}

document.addEventListener('DOMContentLoaded',()=>{
  setupButtons();
  setTimeout(checkInstall,500);
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(r=>logStatus('✅ SW registered: '+r.scope)).catch(e=>logStatus('❌ SW gagal: '+e));
  }
  setInterval(()=>{const el=document.getElementById('clockTop');if(el)el.innerText=new Date().toLocaleTimeString('id-ID');},1000);
  startGPS();
  if(currentUser&&selectedLokasi){document.getElementById('screen-login').classList.add('hidden');showMainScreen();}
  else if(currentUser){document.getElementById('screen-login').classList.add('hidden');showLokasiScreen();}
});

function startGPS(){if(!navigator.geolocation)return;navigator.geolocation.watchPosition(p=>{gps={lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy};const el=document.getElementById('gpsInfo');if(el)el.innerText=gps.lat.toFixed(5)+','+gps.lng.toFixed(5);const ac=document.getElementById('gpsAccuracy');if(ac)ac.innerText='Akurasi '+Math.round(gps.accuracy)+'m';},e=>{}, {enableHighAccuracy:true});}
function haversine(a,b,c,d){const R=6371e3;const toRad=x=>x*Math.PI/180;const dLat=toRad(c-a);const dLon=toRad(d-b);const aa=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(aa),Math.sqrt(1-aa));}
function doLogin(){const u=document.getElementById('inpUser').value,p=document.getElementById('inpPass').value;if((u==='satpam01'&&p==='123456')||(u==='admin'&&p==='admin123')){const user={username:u,nama:u==='admin'?'Admin SBU':'Budi Santoso',avatar:u==='admin'?'AD':'BS'};localStorage.setItem('sbu_user',JSON.stringify(user));currentUser=user;showLokasiScreen();}else{const e=document.getElementById('loginError');e.textContent='Username/password salah (demo: satpam01 / 123456)';e.classList.remove('hidden');}}
function showLokasiScreen(){document.getElementById('screen-login').classList.add('hidden');const sl=document.getElementById('screen-lokasi');sl.classList.remove('hidden');sl.classList.add('flex');const list=document.getElementById('listLokasi');list.innerHTML='';LOKASI_DEFAULT.forEach(l=>{const div=document.createElement('div');div.className='bg-white rounded-[20px] p-4 flex justify-between items-center';div.innerHTML=`<div><p class="font-bold text-[13px]">${l.nama_lokasi}</p><p class="text-[10px] text-slate-500">${l.alamat}</p></div><button class="bg-slate-900 text-white px-4 h-[36px] rounded-xl text-[11px] font-bold">PILIH</button>`;div.querySelector('button').onclick=()=>{selectedLokasi=l;localStorage.setItem('sbu_lokasi',JSON.stringify(l));showMainScreen();};list.appendChild(div);});}
function showMainScreen(){document.getElementById('screen-lokasi').classList.add('hidden');const sm=document.getElementById('screen-main');sm.classList.remove('hidden');sm.classList.add('flex');document.getElementById('namaTop').innerText=currentUser.nama;document.getElementById('avatarTop').innerText=currentUser.avatar;document.getElementById('lokasiTop').innerText=selectedLokasi.nama_lokasi;updateAbsenUI();}
function doLogout(){localStorage.clear();location.reload();}
function setTab(t){document.querySelectorAll('[id^="tab-"]').forEach(e=>e.classList.add('hidden'));const el=document.getElementById('tab-'+t);if(el)el.classList.remove('hidden');}
function updateAbsenUI(){if(!gps||!selectedLokasi)return;const jarak=haversine(gps.lat,gps.lng,selectedLokasi.latitude,selectedLokasi.longitude);const el=document.getElementById('absenJarak');if(el)el.innerText=`Jarak ${jarak.toFixed(0)}m (max ${selectedLokasi.radius_meter}m) ${jarak<=selectedLokasi.radius_meter?'✅':'❌'}`;}
function openCamera(m){document.getElementById('cameraModal').classList.remove('hidden');document.getElementById('cameraModal').classList.add('flex');}
function closeCamera(){document.getElementById('cameraModal').classList.add('hidden');}
function capturePhoto(){}
function usePhoto(){closeCamera();alert('Absen Mock Berhasil!');}
function submitPatroli(){alert('Patroli Mock Terkirim');}
function submitKejadian(){alert('Kejadian Mock Terkirim');}
function loadRekap(){}
function setInfoTab(t){['gaji','shift','ijin'].forEach(x=>{const el=document.getElementById('info-'+x);if(el)el.classList.add('hidden');});const el=document.getElementById('info-'+t);if(el)el.classList.remove('hidden');}
function submitShift(){alert('Shift Mock');}
function submitIjin(){alert('Ijin Mock');}
