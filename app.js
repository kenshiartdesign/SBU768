const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw-58nnkja5GjCIlKhgujoOaOHwl6q5Db9vO8EbAL3U_taootpJe0RJIjLA0bzFiDdRYQ/exec',
  MAX_ACCURACY: 100
};

let currentUser = JSON.parse(localStorage.getItem('sbu_user') || 'null');
let selectedLokasi = JSON.parse(localStorage.getItem('sbu_lokasi') || 'null');
let gps = null;
let currentCameraAction = '';
let capturedBase64 = null;
let patroliData = { foto1: '', foto2: '' };
let kejadianData = { foto1: '', foto2: '' };
let ijinData = { foto: '' };
let videoStream = null;

// ===== LOADING =====
function showLoading(show) {
  let overlay = document.getElementById('loadingOverlay');
  if (show) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'fixed inset-0 z-[200] bg-black/70 flex items-center justify-center';
      overlay.innerHTML = '<div class="bg-white p-4 rounded-xl flex items-center gap-3 shadow-xl"><div class="w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div><span class="font-bold text-slate-900">Memproses...</span></div>';
      document.body.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

// ===== GPS =====
function startGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(p => {
    gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    const el = document.getElementById('gpsInfo');
    if (el) el.innerText = 'GPS: ' + gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5) + ' (Akurasi: ' + Math.round(gps.accuracy) + 'm)';
    updateAbsenUI();
  }, e => { console.error('GPS Error:', e); }, { enableHighAccuracy: true, timeout: 10000 });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function updateAbsenUI() {
  if (!gps || !selectedLokasi) return;
  const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
  const el = document.getElementById('absenJarak');
  const isValid = jarak <= selectedLokasi.radius_meter;
  if (el) {
    el.innerHTML = '<span class="' + (isValid ? 'text-green-600' : 'text-red-600') + '">' + jarak.toFixed(0) + 'm</span> <span class="text-slate-500">/ Max: ' + selectedLokasi.radius_meter + 'm</span>';
  }
}

// ===== JAM & TANGGAL =====
function updateJamDigital() {
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, '0');
  const menit = String(now.getMinutes()).padStart(2, '0');
  const detik = String(now.getSeconds()).padStart(2, '0');
  const jamEl = document.getElementById('jamDigital');
  if (jamEl) jamEl.innerText = jam + ':' + menit + ':' + detik;
}

function hitungHariPasaran() {
  const pasaran = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
  const referensi = new Date(1900, 0, 1);
  const selisihHari = Math.floor((new Date() - referensi) / (1000 * 60 * 60 * 24));
  return pasaran[((selisihHari % 5) + 5) % 5];
}

function updateTanggalLengkap() {
  const now = new Date();
  const hariMasehi = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const tglEl = document.getElementById('tanggalLengkap');
  if (tglEl) tglEl.innerText = hariMasehi[now.getDay()] + ' ' + hitungHariPasaran() + ', ' + now.getDate() + ' ' + bulan[now.getMonth()] + ' ' + now.getFullYear();
}

function startClock() {
  updateJamDigital();
  updateTanggalLengkap();
  setInterval(() => {
    updateJamDigital();
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() <= 2) updateTanggalLengkap();
  }, 1000);
}

// ===== JAM MINI DI HEADER ABSEN =====
function updateJamMini() {
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, '0');
  const menit = String(now.getMinutes()).padStart(2, '0');
  const jamEl = document.getElementById('jamDigitalMini');
  if (jamEl) jamEl.innerText = jam + ':' + menit;
  
  const hariPasaranEl = document.getElementById('hariPasaranMini');
  if (hariPasaranEl) hariPasaranEl.innerText = hitungHariPasaran();
  
  const tanggalEl = document.getElementById('tanggalMini');
  if (tanggalEl) {
    const hariMasehi = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
    tanggalEl.innerText = hariMasehi[now.getDay()] + ', ' + now.getDate() + ' ' + bulan[now.getMonth()];
  }
}

setInterval(updateJamMini, 1000);
updateJamMini();

// ===== LOGIN & LOKASI =====
async function doLogin() {
  const u = document.getElementById('inpUser').value.trim();
  const p = document.getElementById('inpPass').value.trim();
  if (!u || !p) return;
  showLoading(true);
  try {
    const response = await fetch(CONFIG.GAS_URL + '?action=login&username=' + encodeURIComponent(u) + '&password=' + encodeURIComponent(p));
    const result = await response.json();
    if (result.status === 'success') {
      currentUser = result.user;
      localStorage.setItem('sbu_user', JSON.stringify(currentUser));
      document.getElementById('screen-login').classList.add('hidden');
      await loadLokasi();
    } else {
      const err = document.getElementById('loginError');
      err.textContent = result.message;
      err.classList.remove('hidden');
    }
  } catch (e) {
    alert('Koneksi gagal: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function loadLokasi() {
  showLoading(true);
  try {
    const response = await fetch(CONFIG.GAS_URL + '?action=getLokasi');
    const result = await response.json();
    document.getElementById('screen-login').classList.add('hidden');
    const sl = document.getElementById('screen-lokasi');
    sl.classList.remove('hidden');
    sl.classList.add('flex');
    const list = document.getElementById('listLokasi');
    list.innerHTML = '';
    if (result.data && result.data.length > 0) {
      result.data.forEach(l => {
        const div = document.createElement('div');
        div.className = 'bg-white rounded-[20px] p-4 flex justify-between items-center shadow-sm';
        div.innerHTML = '<div><p class="font-bold text-sm">' + l.nama_lokasi + '</p><p class="text-xs text-slate-500">' + l.alamat + '</p></div><button class="bg-slate-900 text-white px-4 h-9 rounded-xl text-xs font-bold active:scale-95 transition">PILIH</button>';
        div.querySelector('button').onclick = () => {
          selectedLokasi = l;
          localStorage.setItem('sbu_lokasi', JSON.stringify(l));
          showMainScreen();
        };
        list.appendChild(div);
      });
    } else {
      list.innerHTML = '<p class="text-center text-slate-500 text-sm w-full">Tidak ada lokasi aktif.</p>';
    }
  } catch (e) {
    alert('Gagal memuat lokasi: ' + e.message);
  } finally {
    showLoading(false);
  }
}

async function showMainScreen() {
  document.getElementById('screen-lokasi').classList.add('hidden');
  const sm = document.getElementById('screen-main');
  sm.classList.remove('hidden');
  sm.classList.add('flex');
  
  document.getElementById('namaTop').innerText = currentUser.nama;
  document.getElementById('avatarTop').innerText = currentUser.avatar;
  document.getElementById('lokasiTop').innerText = selectedLokasi.nama_lokasi;
  document.getElementById('infoLokasiAbsen').innerText = selectedLokasi.nama_lokasi;
  
  document.getElementById('namaProfil').innerText = currentUser.nama;
  document.getElementById('avatarProfil').innerText = currentUser.avatar;
  document.getElementById('roleProfil').innerText = currentUser.role.toUpperCase();
  document.getElementById('profilNama').innerText = currentUser.nama;
  document.getElementById('profilAlamat').innerText = currentUser.alamat || '-';
  document.getElementById('profilTlp').innerText = currentUser.no_tlp || '-';
  document.getElementById('profilEmail').innerText = currentUser.email || '-';
  document.getElementById('profilNik').innerText = currentUser.nik || '-';
  
  updateAbsenUI();
  
  const savedStatus = JSON.parse(localStorage.getItem('sbu_absen_status') || 'null');
  const btnMasuk = document.getElementById('btnAbsenMasuk');
  const btnPulang = document.getElementById('btnAbsenPulang');
  const pesanEl = document.getElementById('absenPesan');
  
  if (savedStatus && savedStatus.last_action === 'masuk') {
    btnMasuk.disabled = true;
    btnMasuk.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnMasuk.onclick = null;
    btnPulang.disabled = false;
    btnPulang.className = 'h-20 bg-green-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
    btnPulang.onclick = () => openCamera('pulang');
    if (pesanEl) { pesanEl.innerText = 'Anda sudah absen masuk. Silakan absen pulang.'; pesanEl.className = 'text-sm font-bold text-green-600'; }
  } else if (savedStatus && savedStatus.last_action === 'pulang') {
    btnMasuk.disabled = true;
    btnMasuk.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnMasuk.onclick = null;
    btnPulang.disabled = true;
    btnPulang.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnPulang.onclick = null;
    if (pesanEl) { pesanEl.innerText = 'Anda sudah absen pulang. Cooldown 5 jam.'; pesanEl.className = 'text-sm font-bold text-red-600'; }
  } else {
    await checkAbsenStatus();
  }
  
  loadSlipGaji();
  loadPengajuanUser();
}

async function checkAbsenStatus() {
  if (!currentUser) return;
  const btnMasuk = document.getElementById('btnAbsenMasuk');
  const btnPulang = document.getElementById('btnAbsenPulang');
  const pesanEl = document.getElementById('absenPesan');
  
  try {
    const url = CONFIG.GAS_URL + '?action=getAbsenStatus&username=' + encodeURIComponent(currentUser.username) + '&t=' + Date.now();
    const res = await fetch(url);
    const result = await res.json();
    
    if (result.status === 'success') {
      if (result.tombol_masuk === true) {
        btnMasuk.disabled = false;
        btnMasuk.className = 'h-20 bg-slate-900 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
        btnMasuk.onclick = () => openCamera('masuk');
      } else {
        btnMasuk.disabled = true;
        btnMasuk.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
        btnMasuk.onclick = null;
      }
      
      if (result.tombol_pulang === true) {
        btnPulang.disabled = false;
        btnPulang.className = 'h-20 bg-green-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
        btnPulang.onclick = () => openCamera('pulang');
      } else {
        btnPulang.disabled = true;
        btnPulang.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
        btnPulang.onclick = null;
      }
      
      if (pesanEl) {
        pesanEl.innerText = result.pesan || '';
        if (result.pesan.includes('sudah absen masuk')) pesanEl.className = 'text-sm font-bold text-green-600';
        else if (result.pesan.toLowerCase().includes('terkunci')) pesanEl.className = 'text-sm font-bold text-red-600';
        else pesanEl.className = 'text-sm font-bold text-amber-600';
      }
      
      if (result.debug_last_masuk && !result.debug_last_pulang) {
        localStorage.setItem('sbu_absen_status', JSON.stringify({ last_action: 'masuk', timestamp: new Date(result.debug_last_masuk).toISOString() }));
      } else if (result.debug_last_pulang) {
        localStorage.setItem('sbu_absen_status', JSON.stringify({ last_action: 'pulang', timestamp: new Date(result.debug_last_pulang).toISOString() }));
      } else {
        localStorage.removeItem('sbu_absen_status');
      }
    }
  } catch (e) {
    console.error('Check status error:', e);
  }
}

// ===== KAMERA DEPAN (SELFIE) =====
async function openCameraAbsen(action) {
  currentCameraAction = action;
  const modal = document.getElementById('cameraModalAbsen');
  const video = document.getElementById('videoLive');
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = videoStream;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } catch (err) {
    console.error('openCameraAbsen Error:', err);
    alert('Gagal mengakses kamera depan: ' + err.message);
  }
}

function closeCameraAbsen() {
  const modal = document.getElementById('cameraModalAbsen');
  const video = document.getElementById('videoLive');
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  video.srcObject = null;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function captureSelfie() {
  const video = document.getElementById('videoLive');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const now = new Date();
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tanggal = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const statusText = currentCameraAction === 'masuk' ? 'ABSEN MASUK' : 'ABSEN PULANG';
  const lokasiText = selectedLokasi ? selectedLokasi.nama_lokasi : 'Unknown';
  const namaUser = currentUser ? currentUser.nama : 'Unknown';
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const watermarkHeight = 130;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, canvas.height - watermarkHeight, canvas.width, watermarkHeight);
  
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
  ctx.fillText(statusText, canvas.width / 2, canvas.height - watermarkHeight + 35);
  
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px Arial';
  ctx.fillText(namaUser, canvas.width / 2, canvas.height - watermarkHeight + 65);
  
  ctx.fillStyle = '#e5e7eb'; ctx.font = '15px Arial';
  ctx.fillText(tanggal, canvas.width / 2, canvas.height - watermarkHeight + 90);
  
  ctx.fillStyle = '#10b981'; ctx.font = 'bold 16px Arial';
  ctx.fillText('⏰ ' + jam, canvas.width / 2, canvas.height - watermarkHeight + 115);
  
  if (gps) {
    ctx.fillStyle = '#9ca3af'; ctx.font = '13px monospace';
    ctx.fillText('📍 ' + lokasiText + ' | ' + gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5), canvas.width / 2, canvas.height - watermarkHeight + 140);
  }
  
  capturedBase64 = canvas.toDataURL('image/jpeg', 0.7);
  closeCameraAbsen();
  
  const btnMasuk = document.getElementById('btnAbsenMasuk');
  const btnPulang = document.getElementById('btnAbsenPulang');
  const pesanEl = document.getElementById('absenPesan');
  
  if (currentCameraAction === 'masuk') {
    btnMasuk.disabled = true;
    btnMasuk.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnMasuk.onclick = null;
    btnPulang.disabled = false;
    btnPulang.className = 'h-20 bg-green-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
    btnPulang.onclick = () => openCamera('pulang');
    if (pesanEl) { pesanEl.innerText = 'Anda sudah absen masuk. Silakan absen pulang.'; pesanEl.className = 'text-sm font-bold text-green-600'; }
  } else if (currentCameraAction === 'pulang') {
    btnMasuk.disabled = true;
    btnMasuk.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnMasuk.onclick = null;
    btnPulang.disabled = true;
    btnPulang.className = 'h-20 bg-slate-200 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnPulang.onclick = null;
    if (pesanEl) { pesanEl.innerText = 'Anda sudah absen pulang. Cooldown 5 jam.'; pesanEl.className = 'text-sm font-bold text-red-600'; }
  }
  
  localStorage.setItem('sbu_absen_status', JSON.stringify({ last_action: currentCameraAction, timestamp: now.toISOString() }));

  showLoading(true);
  try {
    const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
    const payload = {
      action: currentCameraAction === 'masuk' ? 'absenMasuk' : 'absenPulang',
      username: currentUser.username,
      nama: currentUser.nama,
      id_lokasi: selectedLokasi.id_lokasi,
      nama_lokasi: selectedLokasi.nama_lokasi,
      jenis: currentCameraAction.toUpperCase(),
      latitude: gps.lat,
      longitude: gps.lng,
      accuracy: Math.round(gps.accuracy),
      is_mock: 'NO',
      timemark: now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID') + ' | ' + selectedLokasi.nama_lokasi,
      foto_base64: capturedBase64
    };
    
    const response = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
    const result = await response.json();
    
    if (result.status === 'success') {
      alert('✅ Absen ' + currentCameraAction.toUpperCase() + ' berhasil!\nJarak: ' + result.jarak + 'm');
    } else {
      alert('❌ Gagal: ' + result.message);
      await checkAbsenStatus();
    }
  } catch (e) {
    console.error('Error kirim absen:', e);
    alert('❌ Koneksi gagal: ' + e.message);
    await checkAbsenStatus();
  } finally {
    showLoading(false);
  }
}

// ===== KAMERA MODAL (PATROLI/KEJADIAN/IJIN) =====
function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

document.getElementById('cameraInput').addEventListener('change', async function(e) {
  if (e.target.files && e.target.files[0]) {
    showLoading(true);
    capturedBase64 = await compressImage(e.target.files[0], 800, 0.7);
    const preview = document.getElementById('previewImage');
    preview.src = capturedBase64;
    preview.classList.remove('hidden');
    document.getElementById('btnSendPhoto').classList.remove('hidden');
    document.getElementById('cameraHint').classList.add('hidden');
    showLoading(false);
  }
});

function openCamera(action) {
  currentCameraAction = action;
  if (action === 'masuk' || action === 'pulang') {
    openCameraAbsen(action);
    return;
  }
  capturedBase64 = null;
  const modal = document.getElementById('cameraModal');
  const preview = document.getElementById('previewImage');
  const btnSend = document.getElementById('btnSendPhoto');
  const hint = document.getElementById('cameraHint');
  const cameraInput = document.getElementById('cameraInput');
  const title = document.getElementById('cameraTitle');
  const timemark = document.getElementById('cameraTimemark');
  
  preview.classList.add('hidden');
  btnSend.classList.add('hidden');
  hint.classList.remove('hidden');
  cameraInput.value = '';
  
  const titles = {
    'patroli1': 'Foto Patroli 1',
    'patroli2': 'Foto Patroli 2',
    'kejadian1': 'Bukti Kejadian 1',
    'kejadian2': 'Bukti Kejadian 2',
    'ijin': 'Bukti Surat/Undangan'
  };
  if (title) title.innerText = titles[action] || 'Ambil Foto';
  if (timemark) {
    const now = new Date();
    timemark.innerText = '📍 ' + (selectedLokasi ? selectedLokasi.nama_lokasi : '-') + ' | ⏰ ' + now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID');
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCamera() {
  document.getElementById('cameraModal').classList.add('hidden');
  document.getElementById('cameraModal').classList.remove('flex');
}

async function sendPhoto() {
  if (!capturedBase64) {
    alert('Error: Tidak ada foto!');
    return;
  }
  closeCamera();
  if (currentCameraAction === 'patroli1') {
    patroliData.foto1 = capturedBase64;
    updateBtn('btnPatroli1', '✅ Foto 1');
  } else if (currentCameraAction === 'patroli2') {
    patroliData.foto2 = capturedBase64;
    updateBtn('btnPatroli2', '✅ Foto 2');
  } else if (currentCameraAction === 'kejadian1') {
    kejadianData.foto1 = capturedBase64;
    updateBtn('btnKejadian1', '✅ Bukti 1');
  } else if (currentCameraAction === 'kejadian2') {
    kejadianData.foto2 = capturedBase64;
    updateBtn('btnKejadian2', '✅ Bukti 2');
  } else if (currentCameraAction === 'ijin') {
    ijinData.foto = capturedBase64;
    updateBtn('btnIjin', '✅ Bukti Terlampir');
  }
}

function updateBtn(id, text) {
  const btn = document.getElementById(id);
  btn.innerText = text;
  btn.classList.add('bg-green-100', 'border-green-400', 'text-green-700');
}

function resetBtn(id, text) {
  const btn = document.getElementById(id);
  btn.innerText = text;
  btn.classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
}

// ===== SUBMIT PATROLI =====
async function submitPatroliFinal() {
  if (!patroliData.foto1 || !patroliData.foto2) return alert('Harap ambil kedua foto patroli!');
  const lokasi = document.getElementById('patroliLokasi').value.trim();
  if (!lokasi) return alert('Harap isi lokasi patroli!');
  showLoading(true);
  const payload = {
    action: 'patroli',
    username: currentUser.username,
    nama: currentUser.nama,
    id_lokasi: selectedLokasi.id_lokasi,
    nama_lokasi: selectedLokasi.nama_lokasi,
    lokasi_patroli: lokasi,
    keterangan: document.getElementById('patroliCatatan').value,
    latitude: gps ? gps.lat : 0,
    longitude: gps ? gps.lng : 0,
    foto1_base64: patroliData.foto1,
    foto2_base64: patroliData.foto2,
    timemark: new Date().toISOString()
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message);
    patroliData = { foto1: '', foto2: '' };
    document.getElementById('patroliLokasi').value = '';
    document.getElementById('patroliCatatan').value = '';
    resetBtn('btnPatroli1', '📷 Foto 1');
    resetBtn('btnPatroli2', '📷 Foto 2');
  } else {
    alert(' Gagal: ' + result.message);
  }
  showLoading(false);
}

// ===== SUBMIT KEJADIAN =====
async function submitKejadianFinal() {
  if (!kejadianData.foto1 || !kejadianData.foto2) return alert('Harap ambil kedua bukti foto!');
  const jenis = document.getElementById('kejadianJenis').value;
  const lokasi = document.getElementById('kejadianLokasi').value.trim();
  if (!jenis || !lokasi) return alert('Harap lengkapi jenis dan lokasi kejadian!');
  showLoading(true);
  const payload = {
    action: 'kejadian',
    username: currentUser.username,
    nama: currentUser.nama,
    jenis_kejadian: jenis,
    lokasi_kejadian: lokasi,
    kronologi: document.getElementById('kejadianKronologi').value,
    latitude: gps ? gps.lat : 0,
    longitude: gps ? gps.lng : 0,
    foto1_base64: kejadianData.foto1,
    foto2_base64: kejadianData.foto2,
    timemark: new Date().toISOString()
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message);
    kejadianData = { foto1: '', foto2: '' };
    document.getElementById('kejadianJenis').value = '';
    document.getElementById('kejadianLokasi').value = '';
    document.getElementById('kejadianKronologi').value = '';
    resetBtn('btnKejadian1', '📷 Bukti 1');
    resetBtn('btnKejadian2', '📷 Bukti 2');
  } else {
    alert('❌ Gagal: ' + result.message);
  }
  showLoading(false);
}

// ===== SUBMIT IJIN =====
async function submitIjinFinal() {
  const mulai = document.getElementById('ijinMulai').value;
  const selesai = document.getElementById('ijinSelesai').value;
  if (!mulai || !selesai) return alert('Harap isi tanggal mulai dan selesai!');
  showLoading(true);
  const payload = {
    action: 'ijinSakit',
    username: currentUser.username,
    nama: currentUser.nama,
    jenis: document.getElementById('ijinJenis').value,
    tanggal_mulai: mulai,
    tanggal_selesai: selesai,
    keterangan: document.getElementById('ijinKet').value,
    foto_base64: ijinData.foto,
    timemark: new Date().toISOString()
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message);
    ijinData = { foto: '' };
    document.getElementById('ijinKet').value = '';
    resetBtn('btnIjin', '📷 Upload Bukti (Surat Dokter/Undangan)');
    loadPengajuanUser();
  } else {
    alert('❌ Gagal: ' + result.message);
  }
  showLoading(false);
}

// ===== SUBMIT TUKAR SHIFT =====
async function submitShiftFinal() {
  const tanggal = document.getElementById('shiftTanggal').value;
  const shiftLama = document.getElementById('shiftLama').value;
  const shiftBaru = document.getElementById('shiftBaru').value;
  const penggantiUser = document.getElementById('shiftPenggantiUser').value.trim();
  const penggantiNama = document.getElementById('shiftPenggantiNama').value.trim();
  const alasan = document.getElementById('shiftAlasan').value.trim();
  if (!tanggal || !penggantiUser || !penggantiNama || !alasan) return alert('Harap lengkapi semua data!');
  if (shiftLama === shiftBaru) return alert('Shift lama dan baru tidak boleh sama!');
  showLoading(true);
  const payload = {
    action: 'tukarShift',
    username_pemohon: currentUser.username,
    nama_pemohon: currentUser.nama,
    tanggal_tukar: tanggal,
    shift_lama: shiftLama,
    shift_baru: shiftBaru,
    username_pengganti: penggantiUser,
    nama_pengganti: penggantiNama,
    alasan: alasan
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message + '\n\nMenunggu approval admin.');
    document.getElementById('shiftTanggal').value = '';
    document.getElementById('shiftPenggantiUser').value = '';
    document.getElementById('shiftPenggantiNama').value = '';
    document.getElementById('shiftAlasan').value = '';
    loadPengajuanUser();
  } else {
    alert('❌ Gagal: ' + result.message);
  }
  showLoading(false);
}

// ===== RIWAYAT PENGAJUAN =====
async function loadPengajuanUser() {
  if (!currentUser) return;
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getPengajuanUser&username=' + currentUser.username);
    const result = await res.json();
    if (result.status !== 'success') return;
    const data = result.data;
    const listEl = document.getElementById('listPengajuan');
    const allPengajuan = [];
    if (data.ijin && data.ijin.length > 0) data.ijin.forEach(p => allPengajuan.push({ type: 'IJIN', ...p }));
    if (data.shift && data.shift.length > 0) data.shift.forEach(p => allPengajuan.push({ type: 'SHIFT', ...p }));
    allPengajuan.reverse();
    if (allPengajuan.length === 0) {
      listEl.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Belum ada pengajuan.</p>';
    } else {
      listEl.innerHTML = allPengajuan.map(p => {
        let statusColor = p.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : p.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        let statusIcon = p.status === 'PENDING' ? '⏳' : p.status === 'APPROVED' ? '✅' : '';
        if (p.type === 'IJIN') {
          return '<div class="bg-slate-50 p-3 rounded-xl border border-slate-200"><div class="flex justify-between items-start mb-1"><p class="font-bold text-xs text-blue-600"><i class="fa-solid fa-file-medical"></i> ' + p.jenis + '</p><span class="px-2 py-0.5 rounded-full text-[9px] font-bold ' + statusColor + '">' + statusIcon + ' ' + p.status + '</span></div><p class="text-[10px] text-slate-600">📅 ' + p.tanggal_mulai + ' s/d ' + p.tanggal_selesai + '</p><p class="text-[10px] text-slate-500 mt-1">💬 ' + (p.keterangan || '-') + '</p></div>';
        } else {
          return '<div class="bg-slate-50 p-3 rounded-xl border border-slate-200"><div class="flex justify-between items-start mb-1"><p class="font-bold text-xs text-purple-600"><i class="fa-solid fa-right-left"></i> Tukar Shift</p><span class="px-2 py-0.5 rounded-full text-[9px] font-bold ' + statusColor + '">' + statusIcon + ' ' + p.status + '</span></div><p class="text-[10px] text-slate-600">📅 ' + p.tanggal + ' | ' + p.shift_lama + ' → ' + p.shift_baru + '</p><p class="text-[10px] text-slate-500 mt-1">👤 Pengganti: ' + p.pengganti + '</p></div>';
        }
      }).join('');
    }
  } catch (e) {
    console.error('Gagal load pengajuan:', e);
  }
}

// ===== SLIP GAJI =====
async function loadSlipGaji() {
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getSlipGaji&username=' + currentUser.username);
    const result = await res.json();
    const list = document.getElementById('listSlipGaji');
    if (result.status === 'success' && result.data.length > 0) {
      list.innerHTML = result.data.map(s => '<div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200"><div><p class="font-bold text-sm">' + s.periode + '</p><p class="text-[10px] text-slate-500">Total: Rp ' + Number(s.total).toLocaleString('id-ID') + '</p></div><a href="' + s.file_url + '" target="_blank" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold">LIHAT</a></div>').join('');
    } else {
      list.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Belum ada slip gaji.</p>';
    }
  } catch (e) {
    console.error(e);
  }
}

// ===== NAVIGASI INFO =====
function showInfoSub(subName) {
  document.getElementById('info-menu-utama').classList.add('hidden');
  document.querySelectorAll('[id^="info-sub-"]').forEach(el => el.classList.add('hidden'));
  const subEl = document.getElementById('info-sub-' + subName);
  if (subEl) subEl.classList.remove('hidden');
  if (subName === 'rekap') loadRekapAbsensi();
  if (subName === 'riwayat') loadPengajuanUser();
  if (subName === 'gaji') loadSlipGaji();
}

function backToInfoMenu() {
  document.querySelectorAll('[id^="info-sub-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('info-menu-utama').classList.remove('hidden');
}

// ===== REKAP ABSENSI =====
let rekapDataGlobal = {};

async function loadRekapAbsensi() {
  if (!currentUser) return;
  const bulan = document.getElementById('rekapBulan').value;
  const bulanAktif = bulan || (() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  })();
  if (!bulan) document.getElementById('rekapBulan').value = bulanAktif;
  const [tahun, bln] = bulanAktif.split('-').map(Number);
  const now = new Date();
  const bulanSudahLewat = (tahun < now.getFullYear()) || (tahun === now.getFullYear() && bln < now.getMonth() + 1);
  try {
    const resAbsen = await fetch(CONFIG.GAS_URL + '?action=getRekap&username=' + currentUser.username + '&bulan=' + bulanAktif);
    const resultAbsen = await resAbsen.json();
    const resIjin = await fetch(CONFIG.GAS_URL + '?action=getPengajuanUser&username=' + currentUser.username);
    const resultIjin = await resIjin.json();
    const absenList = (resultAbsen.status === 'success' && resultAbsen.data) ? resultAbsen.data : [];
    const ijinList = (resultIjin.status === 'success' && resultIjin.data && resultIjin.data.ijin) ? resultIjin.data.ijin.filter(i => {
      if (i.status !== 'APPROVED') return false;
      const t = new Date(i.tanggal_mulai);
      return t.getFullYear() === tahun && (t.getMonth() + 1) === bln;
    }) : [];
    const grouped = {};
    absenList.forEach(a => {
      const tgl = new Date(a.timestamp);
      const key = tgl.getFullYear() + '-' + String(tgl.getMonth() + 1).padStart(2, '0') + '-' + String(tgl.getDate()).padStart(2, '0');
      if (!grouped[key]) grouped[key] = { masuk: null, pulang: null, lokasi: a.lokasi, timestamp: a.timestamp };
      if (a.jenis === 'MASUK' && !grouped[key].masuk) grouped[key].masuk = { jam: tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), foto: a.foto };
      if (a.jenis === 'PULANG' && !grouped[key].pulang) grouped[key].pulang = { jam: tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), foto: a.foto };
    });
    rekapDataGlobal = { grouped, ijinList, tahun, bln, bulanSudahLewat };
    const hariKerja = getHariKerjaBulan(tahun, bln);
    const hariDenganAbsen = Object.keys(grouped).length;
    const hariIjin = ijinList.length;
    let alphaCount = '-';
    let infoAlphaText = '* Alpha dihitung otomatis di akhir bulan';
    if (bulanSudahLewat) {
      alphaCount = Math.max(0, hariKerja - hariDenganAbsen - hariIjin);
      infoAlphaText = '✓ Alpha bulan ' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][bln-1] + ' ' + tahun + ': ' + alphaCount + ' hari';
    } else if (tahun === now.getFullYear() && bln === now.getMonth() + 1) {
      infoAlphaText = '⏳ Bulan berjalan - Alpha akan dihitung di akhir bulan';
    }
    document.getElementById('statHadir').innerText = hariDenganAbsen;
    document.getElementById('statIjin').innerText = hariIjin;
    document.getElementById('statSakit').innerText = '0';
    document.getElementById('statAlpha').innerText = alphaCount;
    document.getElementById('infoAlpha').innerText = infoAlphaText;
    renderKalender(tahun, bln, grouped, ijinList);
    renderDetailHarian(grouped, ijinList, null);
  } catch (e) {
    console.error('Gagal load rekap:', e);
  }
}

function renderKalender(tahun, bln, grouped, ijinList) {
  const gridEl = document.getElementById('kalenderGrid');
  const firstDay = new Date(tahun, bln - 1, 1);
  const daysInMonth = new Date(tahun, bln, 0).getDate();
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;
  const todayStr = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
  let html = '';
  for (let i = 0; i < offset; i++) html += '<div class="h-11"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = tahun + '-' + String(bln).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const data = grouped[dateStr];
    const adaIjin = ijinList.some(i => {
      const mulai = new Date(i.tanggal_mulai);
      const selesai = new Date(i.tanggal_selesai);
      const cur = new Date(tahun, bln - 1, d);
      return cur >= mulai && cur <= selesai;
    });
    let bgClass = 'bg-slate-100 text-slate-700';
    let borderClass = '';
    if (adaIjin) bgClass = 'bg-orange-200 text-orange-800';
    else if (data) {
      if (data.masuk && data.pulang) bgClass = 'bg-green-200 text-green-800';
      else bgClass = 'bg-yellow-200 text-yellow-800';
    }
    if (dateStr === todayStr) borderClass = 'border-2 border-blue-500';
    html += '<div onclick="pilihTanggalKalender(\'' + dateStr + '\')" class="h-11 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer hover:scale-105 transition active:scale-95 ' + bgClass + ' ' + borderClass + '">' + d + '</div>';
  }
  gridEl.innerHTML = html;
}

function pilihTanggalKalender(dateStr) {
  renderDetailHarian(rekapDataGlobal.grouped, rekapDataGlobal.ijinList, dateStr);
}

function renderDetailHarian(grouped, ijinList, filterTanggal) {
  const tabelEl = document.getElementById('tabelDetailHarian');
  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const displayKeys = filterTanggal ? [filterTanggal] : sortedKeys;
  if (displayKeys.length === 0) {
    tabelEl.innerHTML = '<tr><td colspan="4" class="py-4 text-center text-slate-400 text-xs">Tidak ada data absensi.</td></tr>';
    return;
  }
  tabelEl.innerHTML = displayKeys.map(key => {
    const d = new Date(key);
    const tglStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
    const data = grouped[key];
    const adaIjin = ijinList.some(i => {
      const mulai = new Date(i.tanggal_mulai);
      const selesai = new Date(i.tanggal_selesai);
      return d >= mulai && d <= selesai;
    });
    let statusBadge = '';
    if (adaIjin) statusBadge = '<span class="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-xs font-bold">Izin</span>';
    else if (data && data.masuk && data.pulang) statusBadge = '<span class="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-bold">Lengkap</span>';
    else if (data && (data.masuk || data.pulang)) statusBadge = '<span class="bg-yellow-100 text-yellow-700 px-2.5 py-1 rounded-full text-xs font-bold">Tdk Lengkap</span>';
    else statusBadge = '<span class="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-xs font-bold">Alpha</span>';
    const masukCell = data && data.masuk ? '<a href="' + (data.masuk.foto || '#') + '" target="_blank" class="inline-flex items-center gap-1 text-green-600 font-bold text-xs"><i class="fa-solid fa-arrow-right-to-bracket text-xs"></i> ' + data.masuk.jam + '</a>' : '<span class="text-slate-300">-</span>';
    const pulangCell = data && data.pulang ? '<a href="' + (data.pulang.foto || '#') + '" target="_blank" class="inline-flex items-center gap-1 text-red-600 font-bold text-xs"><i class="fa-solid fa-arrow-right-from-bracket text-xs"></i> ' + data.pulang.jam + '</a>' : '<span class="text-slate-300">-</span>';
    return '<tr class="border-b border-slate-100 hover:bg-slate-50 transition"><td class="py-2 px-2 font-bold text-slate-700 text-xs">' + tglStr + '</td><td class="py-2 px-2 text-center">' + masukCell + '</td><td class="py-2 px-2 text-center">' + pulangCell + '</td><td class="py-2 px-2 text-center">' + statusBadge + '</td></tr>';
  }).join('');
}

function getHariKerjaBulan(tahun, bulan) {
  let count = 0;
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(tahun, bulan - 1, d).getDay() !== 0) count++;
  }
  return count;
}

// ===== NAVIGASI TAB =====
function setTab(t, btnElement) {
  document.querySelectorAll('[id^="tab-"]').forEach(e => e.classList.add('hidden'));
  document.getElementById('tab-' + t).classList.remove('hidden');
  document.querySelectorAll('.navBtn').forEach(btn => {
    btn.className = btn.className.replace('bg-slate-900 text-white', 'bg-slate-100 text-slate-700');
  });
  if (btnElement) btnElement.className = btnElement.className.replace('bg-slate-100 text-slate-700', 'bg-slate-900 text-white');
  
  if (t === 'info') backToInfoMenu();
  if (t === 'profil') {
    document.getElementById('profilNama').innerText = currentUser.nama;
    document.getElementById('profilAlamat').innerText = currentUser.alamat || '-';
    document.getElementById('profilTlp').innerText = currentUser.no_tlp || '-';
    document.getElementById('profilEmail').innerText = currentUser.email || '-';
    document.getElementById('profilNik').innerText = currentUser.nik || '-';
  }
}

function kembaliKePilihLokasi() {
  if (confirm('Yakin ingin mengganti lokasi kerja?\n\nAnda akan kembali ke halaman pilih lokasi.')) {
    localStorage.removeItem('sbu_lokasi');
    localStorage.removeItem('sbu_absen_status');
    selectedLokasi = null;
    document.getElementById('screen-main').classList.add('hidden');
    document.getElementById('screen-main').classList.remove('flex');
    const sl = document.getElementById('screen-lokasi');
    sl.classList.remove('hidden');
    sl.classList.add('flex');
    loadLokasi();
  }
}

function doLogout() {
  if (confirm('Yakin ingin keluar?')) {
    localStorage.clear();
    location.reload();
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  startGPS();
  startClock();
  if (currentUser && selectedLokasi) {
    document.getElementById('screen-login').classList.add('hidden');
    showMainScreen();
  } else if (currentUser) {
    document.getElementById('screen-login').classList.add('hidden');
    loadLokasi();
  }
});
