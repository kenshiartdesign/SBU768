// GANTI URL INI DENGAN URL DEPLOYMENT WEB APP GAS ANDA YANG BARU!
const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw-58nnkja5GjCIlKhgujoOaOHwl6q5Db9vO8EbAL3U_taootpJe0RJIjLA0bzFiDdRYQ/exec',
  MAX_ACCURACY: 60
};

let currentUser = JSON.parse(localStorage.getItem('sbu_user') || 'null');
let selectedLokasi = JSON.parse(localStorage.getItem('sbu_lokasi') || 'null');
let gps = null;
let currentCameraAction = '';
let capturedBase64 = null;
let patroliData = { foto1: '', foto2: '' };

function showLoading(show) {
  const overlay = document.getElementById('loadingOverlay');
  if (show) {
    if (!overlay) {
      const div = document.createElement('div');
      div.id = 'loadingOverlay';
      div.className = 'fixed inset-0 z-[200] bg-black/70 flex items-center justify-center';
      div.innerHTML = '<div class="bg-white p-4 rounded-xl flex items-center gap-3 shadow-xl"><div class="w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div><span class="font-bold text-slate-900">Memproses...</span></div>';
      document.body.appendChild(div);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

function startGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(p => {
    gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    const el = document.getElementById('gpsInfo');
    if (el) el.innerText = `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (Akurasi: ${Math.round(gps.accuracy)}m)`;
    updateAbsenUI();
  }, e => {
    console.error("GPS Error:", e);
    const el = document.getElementById('gpsInfo');
    if (el) el.innerText = "Gagal mendapatkan GPS. Pastikan izin lokasi diaktifkan.";
  }, { enableHighAccuracy: true, timeout: 10000 });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function doLogin() {
  const u = document.getElementById('inpUser').value.trim();
  const p = document.getElementById('inpPass').value.trim();
  if (!u || !p) return;
  
  showLoading(true);
  try {
    const response = await fetch(`${CONFIG.GAS_URL}?action=login&username=${encodeURIComponent(u)}&password=${encodeURIComponent(p)}`);
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
    const response = await fetch(`${CONFIG.GAS_URL}?action=getLokasi`);
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
        div.innerHTML = `<div><p class="font-bold text-[13px]">${l.nama_lokasi}</p><p class="text-[10px] text-slate-500">${l.alamat}</p></div><button class="bg-slate-900 text-white px-4 h-[36px] rounded-xl text-[11px] font-bold active:scale-95 transition">PILIH</button>`;
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

function showMainScreen() {
  document.getElementById('screen-lokasi').classList.add('hidden');
  const sm = document.getElementById('screen-main');
  sm.classList.remove('hidden');
  sm.classList.add('flex');
  document.getElementById('namaTop').innerText = currentUser.nama;
  document.getElementById('avatarTop').innerText = currentUser.avatar;
  document.getElementById('lokasiTop').innerText = selectedLokasi.nama_lokasi;
  updateAbsenUI();
}

function updateAbsenUI() {
  if (!gps || !selectedLokasi) return;
  const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
  const el = document.getElementById('absenJarak');
  const isValid = jarak <= selectedLokasi.radius_meter;
  if (el) {
    el.innerHTML = `Jarak: <span class="${isValid ? 'text-green-600' : 'text-red-600'}">${jarak.toFixed(0)}m</span> / Max: ${selectedLokasi.radius_meter}m <br> <span class="text-[10px] text-slate-500">${isValid ? '✅ Anda berada di dalam area' : '❌ Anda berada di luar area'}</span>`;
  }
}

function compressImage(file, maxWidth = 800, quality = 0.7) {
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
    const file = e.target.files[0];
    capturedBase64 = await compressImage(file);
    
    const preview = document.getElementById('previewImage');
    preview.src = capturedBase64;
    preview.classList.remove('hidden');
    document.getElementById('btnSendPhoto').classList.remove('hidden');
    document.getElementById('cameraHint').classList.add('hidden');
    showLoading(false);
  }
});

function openCamera(action) {
  if (!selectedLokasi) return alert('Pilih lokasi terlebih dahulu');
  currentCameraAction = action;
  capturedBase64 = null;
  document.getElementById('previewImage').classList.add('hidden');
  document.getElementById('btnSendPhoto').classList.add('hidden');
  document.getElementById('cameraHint').classList.remove('hidden');
  document.getElementById('cameraInput').value = '';
  
  const titles = { 'masuk': 'Foto Absen Masuk', 'pulang': 'Foto Absen Pulang', 'patroli1': 'Foto Patroli 1', 'patroli2': 'Foto Patroli 2' };
  document.getElementById('cameraTitle').innerText = titles[action] || 'Ambil Foto';
  
  document.getElementById('cameraModal').classList.remove('hidden');
  document.getElementById('cameraModal').classList.add('flex');
}

function closeCamera() {
  document.getElementById('cameraModal').classList.add('hidden');
  document.getElementById('cameraModal').classList.remove('flex');
}

async function sendPhoto() {
  if (!capturedBase64) return;
  closeCamera();
  showLoading(true);
  
  try {
    if (currentCameraAction === 'masuk' || currentCameraAction === 'pulang') {
      await submitAbsenToGAS(currentCameraAction, capturedBase64);
    } else if (currentCameraAction === 'patroli1') {
      patroliData.foto1 = capturedBase64;
      document.getElementById('btnPatroli1').innerText = '✅ Foto 1 Tersimpan';
      document.getElementById('btnPatroli1').classList.add('bg-green-100', 'border-green-400', 'text-green-700');
      alert('Foto 1 tersimpan. Silakan ambil Foto 2 atau langsung Kirim.');
    } else if (currentCameraAction === 'patroli2') {
      patroliData.foto2 = capturedBase64;
      document.getElementById('btnPatroli2').innerText = '✅ Foto 2 Tersimpan';
      document.getElementById('btnPatroli2').classList.add('bg-green-100', 'border-green-400', 'text-green-700');
      alert('Foto 2 tersimpan. Silakan klik "KIRIM LAPORAN PATROLI".');
    }
  } catch (err) {
    alert('Gagal: ' + err.message);
  } finally {
    showLoading(false);
  }
}

async function submitAbsenToGAS(tipe, fotoBase64) {
  const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
  const payload = {
    action: tipe === 'masuk' ? 'absenMasuk' : 'absenPulang',
    username: currentUser.username,
    nama: currentUser.nama,
    id_lokasi: selectedLokasi.id_lokasi,
    nama_lokasi: selectedLokasi.nama_lokasi,
    jenis: tipe.toUpperCase(),
    latitude: gps.lat,
    longitude: gps.lng,
    accuracy: Math.round(gps.accuracy),
    is_mock: 'NO', // PENTING: Mengirim 'NO' agar tidak ditolak oleh backend
    timemark: new Date().toISOString(),
    foto_base64: fotoBase64
  };
  
  const response = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await response.json();
  
  if (result.status === 'success') {
    alert(`✅ Absen ${tipe.toUpperCase()} berhasil!\nJarak: ${result.jarak}m`);
    updateAbsenUI();
  } else {
    alert('❌ Gagal: ' + result.message);
  }
}

async function submitPatroliFinal() {
  if (!patroliData.foto1 || !patroliData.foto2) return alert('Harap ambil kedua foto patroli terlebih dahulu!');
  const catatan = document.getElementById('patroliCatatan').value;
  
  showLoading(true);
  try {
    const payload = {
      action: 'patroli',
      username: currentUser.username,
      nama: currentUser.nama,
      id_lokasi: selectedLokasi.id_lokasi,
      nama_lokasi: selectedLokasi.nama_lokasi,
      lokasi_patroli: selectedLokasi.nama_lokasi,
      keterangan: catatan,
      latitude: gps ? gps.lat : 0,
      longitude: gps ? gps.lng : 0,
      foto1_base64: patroliData.foto1,
      foto2_base64: patroliData.foto2,
      timemark: new Date().toISOString()
    };
    
    const response = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
    const result = await response.json();
    
    if (result.status === 'success') {
      alert('✅ ' + result.message);
      patroliData = { foto1: '', foto2: '' };
      document.getElementById('patroliCatatan').value = '';
      document.getElementById('btnPatroli1').innerText = '📷 Foto 1';
      document.getElementById('btnPatroli1').classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
      document.getElementById('btnPatroli2').innerText = '📷 Foto 2';
      document.getElementById('btnPatroli2').classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
    } else {
      alert('❌ Gagal: ' + result.message);
    }
  } catch (e) {
    alert('Koneksi gagal: ' + e.message);
  } finally {
    showLoading(false);
  }
}

function setTab(t) {
  document.querySelectorAll('[id^="tab-"]').forEach(e => e.classList.add('hidden'));
  const el = document.getElementById('tab-' + t);
  if (el) el.classList.remove('hidden');
}

function doLogout() {
  if(confirm('Yakin ingin keluar?')) {
    localStorage.clear();
    location.reload();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  startGPS();
  if (currentUser && selectedLokasi) {
    document.getElementById('screen-login').classList.add('hidden');
    showMainScreen();
  } else if (currentUser) {
    document.getElementById('screen-login').classList.add('hidden');
    loadLokasi();
  }
});
