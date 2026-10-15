const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbw-58nnkja5GjCIlKhgujoOaOHwl6q5Db9vO8EbAL3U_taootpJe0RJIjLA0bzFiDdRYQ/exec', // GANTI DENGAN URL ANDA
  MAX_ACCURACY: 60
};

let currentUser = JSON.parse(localStorage.getItem('sbu_user') || 'null');
let selectedLokasi = JSON.parse(localStorage.getItem('sbu_lokasi') || 'null');
let gps = null;
let currentCameraAction = '';
let capturedBase64 = null;
let patroliData = { foto1: '', foto2: '' };
let kejadianData = { foto1: '', foto2: '' };
let ijinData = { foto: '' };

// ===== LOADING =====
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
  } else { if (overlay) overlay.remove(); }
}

// ===== GPS =====
function startGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(p => {
    gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    const el = document.getElementById('gpsInfo');
    if (el) el.innerText = `GPS: ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (Akurasi: ${Math.round(gps.accuracy)}m)`;
    updateAbsenUI();
  }, e => { console.error("GPS Error:", e); }, { enableHighAccuracy: true, timeout: 10000 });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3; const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function updateAbsenUI() {
  if (!gps || !selectedLokasi) return;
  const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
  const el = document.getElementById('absenJarak');
  const isValid = jarak <= selectedLokasi.radius_meter;
  if (el) {
    el.innerHTML = `Jarak: <span class="${isValid ? 'text-green-600' : 'text-red-600'}">${jarak.toFixed(0)}m</span> / Max: ${selectedLokasi.radius_meter}m <br> <span class="text-[10px] text-slate-500">${isValid ? '✅ Dalam area' : '❌ Luar area'}</span>`;
  }
}

// ===== JAM DIGITAL & TANGGAL LENGKAP (Masehi + Pasaran Jawa) =====
function updateJamDigital() {
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, '0');
  const menit = String(now.getMinutes()).padStart(2, '0');
  const detik = String(now.getSeconds()).padStart(2, '0');
  const jamEl = document.getElementById('jamDigital');
  if (jamEl) jamEl.innerText = `${jam}:${menit}:${detik}`;
}

function hitungHariPasaran() {
  // Hari pasaran Jawa: Legi, Pahing, Pon, Wage, Kliwon
  const pasaran = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
  // Referensi: 1 Januari 1900 = Legi
  const referensi = new Date(1900, 0, 1);
  const sekarang = new Date();
  const selisihHari = Math.floor((sekarang - referensi) / (1000 * 60 * 60 * 24));
  const indexPasaran = ((selisihHari % 5) + 5) % 5;
  return pasaran[indexPasaran];
}

function updateTanggalLengkap() {
  const now = new Date();
  const hariMasehi = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  const hariNama = hariMasehi[now.getDay()];
  const pasaran = hitungHariPasaran();
  const tanggal = now.getDate();
  const bulanNama = bulan[now.getMonth()];
  const tahun = now.getFullYear();
  
  // Format: "Kamis Kliwon, 15 Oktober 2026"
  const tglEl = document.getElementById('tanggalLengkap');
  if (tglEl) tglEl.innerText = `${hariNama} ${pasaran}, ${tanggal} ${bulanNama} ${tahun}`;
}

// Update semua waktu setiap detik
function startClock() {
  updateJamDigital();
  updateTanggalLengkap();
  setInterval(() => {
    updateJamDigital();
    // Update tanggal hanya saat pergantian hari (00:00:01)
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() <= 2) {
      updateTanggalLengkap();
    }
  }, 1000);
}

// ===== LOGIN =====
async function doLogin() {
  const u = document.getElementById('inpUser').value.trim(); const p = document.getElementById('inpPass').value.trim();
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
      const err = document.getElementById('loginError'); err.textContent = result.message; err.classList.remove('hidden');
    }
  } catch (e) { alert('Koneksi gagal: ' + e.message); } finally { showLoading(false); }
}

// ===== LOKASI =====
async function loadLokasi() {
  showLoading(true);
  try {
    const response = await fetch(`${CONFIG.GAS_URL}?action=getLokasi`);
    const result = await response.json();
    document.getElementById('screen-login').classList.add('hidden');
    const sl = document.getElementById('screen-lokasi'); sl.classList.remove('hidden'); sl.classList.add('flex');
    const list = document.getElementById('listLokasi'); list.innerHTML = '';
    if (result.data && result.data.length > 0) {
      result.data.forEach(l => {
        const div = document.createElement('div');
        div.className = 'bg-white rounded-[20px] p-4 flex justify-between items-center shadow-sm';
        div.innerHTML = `<div><p class="font-bold text-[13px]">${l.nama_lokasi}</p><p class="text-[10px] text-slate-500">${l.alamat}</p></div><button class="bg-slate-900 text-white px-4 h-[36px] rounded-xl text-[11px] font-bold active:scale-95 transition">PILIH</button>`;
        div.querySelector('button').onclick = () => { selectedLokasi = l; localStorage.setItem('sbu_lokasi', JSON.stringify(l)); showMainScreen(); };
        list.appendChild(div);
      });
    } else { list.innerHTML = '<p class="text-center text-slate-500 text-sm w-full">Tidak ada lokasi aktif.</p>'; }
  } catch (e) { alert('Gagal memuat lokasi: ' + e.message); } finally { showLoading(false); }
}

async function showMainScreen() {
  document.getElementById('screen-lokasi').classList.add('hidden');
  const sm = document.getElementById('screen-main'); sm.classList.remove('hidden'); sm.classList.add('flex');
  document.getElementById('namaTop').innerText = currentUser.nama;
  document.getElementById('avatarTop').innerText = currentUser.avatar;
  document.getElementById('lokasiTop').innerText = selectedLokasi.nama_lokasi;
  
  // Update Profil
  document.getElementById('namaProfil').innerText = currentUser.nama;
  document.getElementById('avatarProfil').innerText = currentUser.avatar;
  document.getElementById('roleProfil').innerText = currentUser.role.toUpperCase();
  document.getElementById('profilNama').innerText = currentUser.nama;
  document.getElementById('profilAlamat').innerText = currentUser.alamat || '-';
  document.getElementById('profilTlp').innerText = currentUser.no_tlp || '-';
  document.getElementById('profilEmail').innerText = currentUser.email || '-';
  document.getElementById('profilNik').innerText = currentUser.nik || '-';
  
  updateAbsenUI();
  await checkAbsenStatus(); // Cek status tombol absen
  loadSlipGaji();
  loadPengajuanUser();
}

// ===== CEK STATUS ABSEN (untuk cooldown) =====
async function checkAbsenStatus() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=getAbsenStatus&username=${currentUser.username}`);
    const result = await res.json();
    if (result.status === 'success') {
      const btnMasuk = document.getElementById('btnAbsenMasuk');
      const btnPulang = document.getElementById('btnAbsenPulang');
      const pesanEl = document.getElementById('absenPesan');
      
      if (result.tombol_masuk) {
        btnMasuk.disabled = false;
        btnMasuk.className = 'h-[80px] bg-[#0f172a] text-white rounded-[20px] font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
      } else {
        btnMasuk.disabled = true;
        btnMasuk.className = 'h-[80px] bg-slate-300 text-slate-500 rounded-[20px] font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
      }
      
      if (result.tombol_pulang) {
        btnPulang.disabled = false;
        btnPulang.className = 'h-[80px] bg-amber-400 text-slate-900 rounded-[20px] font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
      } else {
        btnPulang.disabled = true;
        btnPulang.className = 'h-[80px] bg-slate-300 text-slate-500 rounded-[20px] font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
      }
      
      if (pesanEl) pesanEl.innerText = result.pesan || '';
    }
  } catch (e) { console.error('Gagal cek status absen:', e); }
}

// ===== KAMERA & KOMPRESI =====
function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image(); img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas'); let width = img.width; let height = img.height;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
        // Tambahkan timemark di foto
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, height - 40, width, 40);
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px monospace';
        const now = new Date();
        const timemark = `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')} | ${gps ? gps.lat.toFixed(5)+','+gps.lng.toFixed(5) : 'No GPS'}`;
        ctx.fillText(timemark, 10, height - 15);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

document.getElementById('cameraInput').addEventListener('change', async function(e) {
  if (e.target.files && e.target.files[0]) {
    showLoading(true);
    capturedBase64 = await compressImage(e.target.files[0]);
    const preview = document.getElementById('previewImage');
    preview.src = capturedBase64; preview.classList.remove('hidden');
    document.getElementById('btnSendPhoto').classList.remove('hidden');
    document.getElementById('cameraHint').classList.add('hidden');
    showLoading(false);
  }
});

function openCamera(action) {
  currentCameraAction = action; capturedBase64 = null;
  document.getElementById('previewImage').classList.add('hidden');
  document.getElementById('btnSendPhoto').classList.add('hidden');
  document.getElementById('cameraHint').classList.remove('hidden');
  document.getElementById('cameraInput').value = '';
  
  const titles = { 'masuk': 'Selfie Absen Masuk', 'pulang': 'Selfie Absen Pulang', 'patroli1': 'Foto Patroli 1', 'patroli2': 'Foto Patroli 2', 'kejadian1': 'Bukti Kejadian 1', 'kejadian2': 'Bukti Kejadian 2', 'ijin': 'Bukti Surat/Undangan' };
  document.getElementById('cameraTitle').innerText = titles[action] || 'Ambil Foto';
  
  // Update timemark
  const now = new Date();
  const timemark = `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}`;
  document.getElementById('cameraTimemark').innerText = `📍 ${selectedLokasi ? selectedLokasi.nama_lokasi : '-'} | ⏰ ${timemark}`;
  
  document.getElementById('cameraModal').classList.remove('hidden'); document.getElementById('cameraModal').classList.add('flex');
}

function closeCamera() {
  document.getElementById('cameraModal').classList.add('hidden'); document.getElementById('cameraModal').classList.remove('flex');
}

async function sendPhoto() {
  if (!capturedBase64) return;
  closeCamera();
  
  if (currentCameraAction === 'masuk' || currentCameraAction === 'pulang') {
    showLoading(true);
    await submitAbsenToGAS(currentCameraAction, capturedBase64);
    showLoading(false);
  } else if (currentCameraAction === 'patroli1') {
    patroliData.foto1 = capturedBase64; updateBtn('btnPatroli1', '✅ Foto 1');
  } else if (currentCameraAction === 'patroli2') {
    patroliData.foto2 = capturedBase64; updateBtn('btnPatroli2', '✅ Foto 2');
  } else if (currentCameraAction === 'kejadian1') {
    kejadianData.foto1 = capturedBase64; updateBtn('btnKejadian1', '✅ Bukti 1');
  } else if (currentCameraAction === 'kejadian2') {
    kejadianData.foto2 = capturedBase64; updateBtn('btnKejadian2', '✅ Bukti 2');
  } else if (currentCameraAction === 'ijin') {
    ijinData.foto = capturedBase64; updateBtn('btnIjin', '✅ Bukti Terlampir');
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

// ===== SUBMIT ABSEN =====
async function submitAbsenToGAS(tipe, fotoBase64) {
  const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
  const now = new Date();
  const timemark = `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')} | ${selectedLokasi.nama_lokasi} | ${gps.lat.toFixed(5)},${gps.lng.toFixed(5)}`;
  
  const payload = {
    action: tipe === 'masuk' ? 'absenMasuk' : 'absenPulang',
    username: currentUser.username, nama: currentUser.nama,
    id_lokasi: selectedLokasi.id_lokasi, nama_lokasi: selectedLokasi.nama_lokasi,
    jenis: tipe.toUpperCase(), latitude: gps.lat, longitude: gps.lng,
    accuracy: Math.round(gps.accuracy), is_mock: 'NO',
    timemark: timemark, foto_base64: fotoBase64
  };
  const response = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await response.json();
  if (result.status === 'success') { 
    alert(`✅ Absen ${tipe.toUpperCase()} berhasil!\nJarak: ${result.jarak}m`); 
    await checkAbsenStatus(); // Update tombol
  } else { alert(' Gagal: ' + result.message); }
}

// ===== SUBMIT PATROLI =====
async function submitPatroliFinal() {
  if (!patroliData.foto1 || !patroliData.foto2) return alert('Harap ambil kedua foto patroli!');
  const lokasi = document.getElementById('patroliLokasi').value.trim();
  if (!lokasi) return alert('Harap isi lokasi patroli!');
  
  showLoading(true);
  const now = new Date();
  const timemark = `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}`;
  const payload = {
    action: 'patroli', username: currentUser.username, nama: currentUser.nama,
    id_lokasi: selectedLokasi.id_lokasi, nama_lokasi: selectedLokasi.nama_lokasi,
    lokasi_patroli: lokasi, keterangan: document.getElementById('patroliCatatan').value,
    latitude: gps ? gps.lat : 0, longitude: gps ? gps.lng : 0,
    foto1_base64: patroliData.foto1, foto2_base64: patroliData.foto2, timemark: timemark
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message);
    patroliData = { foto1: '', foto2: '' }; 
    document.getElementById('patroliLokasi').value = '';
    document.getElementById('patroliCatatan').value = '';
    resetBtn('btnPatroli1', '📷 Foto 1'); resetBtn('btnPatroli2', '📷 Foto 2');
  } else { alert('❌ Gagal: ' + result.message); }
  showLoading(false);
}

// ===== SUBMIT KEJADIAN =====
async function submitKejadianFinal() {
  if (!kejadianData.foto1 || !kejadianData.foto2) return alert('Harap ambil kedua bukti foto!');
  const jenis = document.getElementById('kejadianJenis').value;
  const lokasi = document.getElementById('kejadianLokasi').value.trim();
  if (!jenis || !lokasi) return alert('Harap lengkapi jenis dan lokasi kejadian!');
  
  showLoading(true);
  const now = new Date();
  const timemark = `${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID')}`;
  const payload = {
    action: 'kejadian', username: currentUser.username, nama: currentUser.nama,
    jenis_kejadian: jenis, lokasi_kejadian: lokasi,
    kronologi: document.getElementById('kejadianKronologi').value,
    latitude: gps ? gps.lat : 0, longitude: gps ? gps.lng : 0,
    foto1_base64: kejadianData.foto1, foto2_base64: kejadianData.foto2, timemark: timemark
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message);
    kejadianData = { foto1: '', foto2: '' };
    document.getElementById('kejadianJenis').value = ''; 
    document.getElementById('kejadianLokasi').value = '';
    document.getElementById('kejadianKronologi').value = '';
    resetBtn('btnKejadian1', '📷 Bukti 1'); resetBtn('btnKejadian2', '📷 Bukti 2');
  } else { alert(' Gagal: ' + result.message); }
  showLoading(false);
}

// ===== SUBMIT IJIN =====
async function submitIjinFinal() {
  const jenis = document.getElementById('ijinJenis').value;
  const mulai = document.getElementById('ijinMulai').value;
  const selesai = document.getElementById('ijinSelesai').value;
  if (!mulai || !selesai) return alert('Harap isi tanggal mulai dan selesai!');
  
  showLoading(true);
  const payload = {
    action: 'ijinSakit', username: currentUser.username, nama: currentUser.nama,
    jenis: jenis, tanggal_mulai: mulai, tanggal_selesai: selesai,
    keterangan: document.getElementById('ijinKet').value,
    foto_base64: ijinData.foto, timemark: new Date().toISOString()
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    alert('✅ ' + result.message);
    ijinData = { foto: '' };
    document.getElementById('ijinKet').value = '';
    resetBtn('btnIjin', '📷 Upload Bukti (Surat Dokter/Undangan)');
    loadPengajuanUser();
  } else { alert('❌ Gagal: ' + result.message); }
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
    action: 'tukarShift', username_pemohon: currentUser.username, nama_pemohon: currentUser.nama,
    tanggal_tukar: tanggal, shift_lama: shiftLama, shift_baru: shiftBaru,
    username_pengganti: penggantiUser, nama_pengganti: penggantiNama, alasan: alasan
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
  } else { alert('❌ Gagal: ' + result.message); }
  showLoading(false);
}

// ===== RIWAYAT PENGAJUAN =====
async function loadPengajuanUser() {
  if (!currentUser) return;
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=getPengajuanUser&username=${currentUser.username}`);
    const result = await res.json();
    if (result.status !== 'success') return;
    
    const data = result.data;
    const listEl = document.getElementById('listPengajuan');
    const allPengajuan = [];
    
    if (data.ijin && data.ijin.length > 0) {
      data.ijin.forEach(p => allPengajuan.push({ type: 'IJIN', ...p }));
    }
    if (data.shift && data.shift.length > 0) {
      data.shift.forEach(p => allPengajuan.push({ type: 'SHIFT', ...p }));
    }
    
    allPengajuan.reverse();
    if (allPengajuan.length === 0) {
      listEl.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Belum ada pengajuan.</p>';
    } else {
      listEl.innerHTML = allPengajuan.map(p => {
        let statusColor = p.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 
                          p.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        let statusIcon = p.status === 'PENDING' ? '⏳' : p.status === 'APPROVED' ? '✅' : '❌';
        
        if (p.type === 'IJIN') {
          return `<div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div class="flex justify-between items-start mb-1">
              <p class="font-bold text-xs text-blue-600"><i class="fa-solid fa-file-medical"></i> ${p.jenis}</p>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${statusColor}">${statusIcon} ${p.status}</span>
            </div>
            <p class="text-[10px] text-slate-600">📅 ${p.tanggal_mulai} s/d ${p.tanggal_selesai}</p>
            <p class="text-[10px] text-slate-500 mt-1">💬 ${p.keterangan || '-'}</p>
          </div>`;
        } else {
          return `<div class="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div class="flex justify-between items-start mb-1">
              <p class="font-bold text-xs text-purple-600"><i class="fa-solid fa-right-left"></i> Tukar Shift</p>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${statusColor}">${statusIcon} ${p.status}</span>
            </div>
            <p class="text-[10px] text-slate-600">📅 ${p.tanggal} | ${p.shift_lama} → ${p.shift_baru}</p>
            <p class="text-[10px] text-slate-500 mt-1">👤 Pengganti: ${p.pengganti}</p>
          </div>`;
        }
      }).join('');
    }
  } catch (e) { console.error('Gagal load pengajuan:', e); }
}

// ===== SLIP GAJI =====
async function loadSlipGaji() {
  try {
    const res = await fetch(`${CONFIG.GAS_URL}?action=getSlipGaji&username=${currentUser.username}`);
    const result = await res.json();
    const list = document.getElementById('listSlipGaji');
    if (result.status === 'success' && result.data.length > 0) {
      list.innerHTML = result.data.map(s => `
        <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div><p class="font-bold text-sm">${s.periode}</p><p class="text-[10px] text-slate-500">Total: Rp ${Number(s.total).toLocaleString('id-ID')}</p></div>
          <a href="${s.file_url}" target="_blank" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold">LIHAT</a>
        </div>
      `).join('');
    } else {
      list.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Belum ada slip gaji.</p>';
    }
  } catch (e) { console.error(e); }
}

// ===== NAVIGASI TAB =====
function setTab(t, btnElement) {
  document.querySelectorAll('[id^="tab-"]').forEach(e => e.classList.add('hidden'));
  document.getElementById('tab-' + t).classList.remove('hidden');
  
  document.querySelectorAll('.navBtn').forEach(btn => {
    btn.className = btn.className.replace('bg-slate-900 text-white', 'bg-slate-100 text-slate-700');
  });
  if (btnElement) {
    btnElement.className = btnElement.className.replace('bg-slate-100 text-slate-700', 'bg-slate-900 text-white');
  }
  
  if (t === 'absen') checkAbsenStatus();
  if (t === 'info') { loadSlipGaji(); loadPengajuanUser(); }
  if (t === 'profil') {
    document.getElementById('profilNama').innerText = currentUser.nama;
    document.getElementById('profilAlamat').innerText = currentUser.alamat || '-';
    document.getElementById('profilTlp').innerText = currentUser.no_tlp || '-';
    document.getElementById('profilEmail').innerText = currentUser.email || '-';
    document.getElementById('profilNik').innerText = currentUser.nik || '-';
  }
}

// ===== LOGOUT =====
function doLogout() {
  if(confirm('Yakin ingin keluar?')) { localStorage.clear(); location.reload(); }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  startGPS();
  startClock(); // TAMBAHKAN BARIS INI
  if (currentUser && selectedLokasi) { document.getElementById('screen-login').classList.add('hidden'); showMainScreen(); }
  else if (currentUser) { document.getElementById('screen-login').classList.add('hidden'); loadLokasi(); }
});
