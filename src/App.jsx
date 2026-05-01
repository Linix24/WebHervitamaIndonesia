import React, { useState, useEffect } from 'react';
import { 
  Home, Camera, ClipboardList, History, Users, 
  Activity, Settings, LogOut, CheckCircle, Clock, 
  MapPin, AlertCircle, Search, Filter, MoreHorizontal,
  ChevronDown, Plus, Trash2, Send
} from 'lucide-react';
import { STAFF, ADMIN, DIVISIONS, LOCATIONS } from './data';
import { 
  todayKey, nowTime, fmtDate, initials, 
  minutesOf, durationLabel, cryptoId, 
  makePhotoData, makeDemoLocation 
} from './utils';
import { supabase } from './lib/supabase';

const DEFAULT_SETTINGS = { start: "08:00", tolerance: 10, end: "17:00", overtimeAfter: "17:30" };

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [view, setView] = useState('login'); // login, staff, admin
  const [tab, setTab] = useState('home');
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [clock, setClock] = useState('');
  const [loading, setLoading] = useState(false);

  // Form States
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [attendanceForm, setAttendanceForm] = useState({
    checkIn: '07:58',
    checkOut: '',
    project: '',
    workType: 'Lapangan',
    note: ''
  });
  const [photo, setPhoto] = useState('');
  const [location, setLocation] = useState(null);
  const [requestForm, setRequestForm] = useState({ type: 'Cuti', date: todayKey(), reason: '' });

  // Load Data from Supabase
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false });
      
      if (attError) throw attError;
      setRecords(attData || []);

      const { data: reqData, error: reqError } = await supabase
        .from('requests')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (reqError) throw reqError;
      setRequests(reqData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
      showToast("Gagal mengambil data dari database.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Setup real-time subscription
    const attendanceSub = supabase
      .channel('attendance_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => fetchData())
      .subscribe();

    const requestSub = supabase
      .channel('request_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => fetchData())
      .subscribe();

    const timer = setInterval(() => {
      setClock(new Date().toLocaleString("id-ID", { 
        weekday: "long", day: "2-digit", month: "long", year: "numeric", 
        hour: "2-digit", minute: "2-digit", second: "2-digit" 
      }));
    }, 1000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(attendanceSub);
      supabase.removeChannel(requestSub);
    };
  }, []);

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  };

  const handleLogin = (u, p) => {
    const username = u || loginForm.username.trim().toUpperCase();
    const password = p || loginForm.password.trim();

    if (username === ADMIN.username && password === ADMIN.password) {
      setCurrentUser(ADMIN);
      setCurrentRole('admin');
      setView('admin');
      setTab('home');
      showToast("Login admin berhasil.");
      return;
    }

    const staff = STAFF.find(s => s.username === username && s.password === password);
    if (staff) {
      setCurrentUser(staff);
      setCurrentRole('staff');
      setView('staff');
      setTab('home');
      setAttendanceForm(prev => ({ ...prev, project: staff.defaultLocation }));
      showToast(`Selamat datang, ${staff.name}.`);
      return;
    }
    showToast("Username atau password salah.");
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentRole(null);
    setView('login');
    setLoginForm({ username: '', password: '' });
  };

  const calcRecord = (record) => {
    if (!record) return { status: 'Belum Absen', statusClass: 'menunggu' };
    const start = minutesOf(settings.start) + Number(settings.tolerance || 0);
    const end = minutesOf(settings.end);
    const overtimeStart = minutesOf(settings.overtimeAfter);
    const cin = minutesOf(record.check_in);
    const cout = minutesOf(record.check_out);
    const lateMins = cin !== null && cin > start ? cin - start : 0;
    const overtimeMins = cout !== null && cout >= overtimeStart ? Math.max(0, cout - end) : 0;
    
    let status = "Hadir";
    let statusClass = "hadir";
    if (lateMins > 0 && overtimeMins > 0) { status = "Telat + Lembur"; statusClass = "lembur"; }
    else if (overtimeMins > 0) { status = "Lembur"; statusClass = "lembur"; }
    else if (lateMins > 0) { status = "Telat"; statusClass = "telat"; }
    
    if (record.check_in && !record.check_out) { status += " / Belum Pulang"; }
    return { lateMins, overtimeMins, status, statusClass };
  };

  const saveAttendance = async (mode) => {
    const checkIn = attendanceForm.checkIn || nowTime();
    const checkOut = mode === 'out' ? (attendanceForm.checkOut || nowTime()) : (attendanceForm.checkOut || null);
    
    // Check if record exists for today
    const existing = records.find(r => r.staff_id === currentUser.id && r.date === todayKey());

    const payload = {
      staff_id: currentUser.id,
      staff_name: currentUser.name,
      date: todayKey(),
      check_in: existing?.check_in || checkIn,
      check_out: checkOut,
      project: attendanceForm.project,
      work_type: attendanceForm.workType,
      note: attendanceForm.note,
      photo: photo || makePhotoData(currentUser.name, checkIn, attendanceForm.project, initials),
      lat: location?.lat || null,
      lng: location?.lng || null,
      address: location?.address || null,
      updated_at: new Date().toISOString()
    };

    try {
      let error;
      if (existing) {
        ({ error } = await supabase
          .from('attendance')
          .update(payload)
          .eq('id', existing.id));
      } else {
        ({ error } = await supabase
          .from('attendance')
          .insert([payload]));
      }

      if (error) throw error;
      showToast(mode === 'in' ? "Absen masuk tersimpan ke database!" : "Absen pulang tersimpan ke database!");
      fetchData();
    } catch (error) {
      console.error("Error saving attendance:", error);
      showToast("Gagal menyimpan ke database.");
    }
  };

  const submitRequest = async () => {
    const newReq = {
      staff_id: currentUser.id,
      staff_name: currentUser.name,
      type: requestForm.type,
      date: requestForm.date,
      reason: requestForm.reason,
      status: 'Menunggu'
    };

    try {
      const { error } = await supabase.from('requests').insert([newReq]);
      if (error) throw error;
      setRequestForm({ type: 'Cuti', date: todayKey(), reason: '' });
      showToast("Pengajuan terkirim ke database!");
      fetchData();
    } catch (error) {
      console.error("Error saving request:", error);
      showToast("Gagal mengirim pengajuan.");
    }
  };

  // Render Login
  if (view === 'login') {
    return (
      <div className="login-layout">
        <div className="hero-card">
          <div className="hero-content">
            <span className="pill">⚡ Supabase Connected</span>
            <h1>Absensi online satu pintu untuk karyawan & HR.</h1>
            <p>Sistem ini sekarang terhubung langsung ke database Supabase. Setiap absen yang dilakukan staff akan langsung muncul di panel HR secara real-time.</p>
            <div className="hero-grid">
              <div className="hero-mini"><b>{STAFF.length}</b><span>Akun staff aktif</span></div>
              <div className="hero-mini"><b>Real-time</b><span>Koneksi Database</span></div>
              <div className="hero-mini"><b>Secure</b><span>Auth & RLS Ready</span></div>
            </div>
          </div>
        </div>
        <div className="login-card">
          <div className="logo-line">
            <div className="logo">
              <div className="logo-mark">HI</div>
              <div>Hervitama<br /><span className="muted" style={{ fontSize: '12px', fontWeight: 800 }}>Online HRIS Supabase</span></div>
            </div>
            <div className="clock" dangerouslySetInnerHTML={{ __html: clock.replace(',', '<br/>') }}></div>
          </div>
          <h2>Login Portal</h2>
          <div className="form-stack">
            <div className="field">
              <label>Username</label>
              <input 
                placeholder="Contoh: HI-001" 
                value={loginForm.username}
                onChange={e => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input 
                type="password" 
                placeholder="Masukkan password" 
                value={loginForm.password}
                onChange={e => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <button className="btn primary full" onClick={() => handleLogin()}>Masuk Dashboard</button>
          </div>
          <div className="demo-box">
            <b>Shortcut Demo</b>
            <div className="btn-row">
              <button className="btn soft" onClick={() => handleLogin('HI-001', 'PW-001')}>Staff HI-001</button>
              <button className="btn ghost" onClick={() => handleLogin('HR-001', 'HR-2026')}>Admin HR</button>
            </div>
          </div>
        </div>
        {toast.show && <div className="toast show">{toast.message}</div>}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="layout">
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-mark">HI</div>
            <div>Hervitama<br /><span className="muted" style={{ fontSize: '12px', fontWeight: 800 }}>Online HRIS</span></div>
          </div>
          <div className="user-chip">
            <div className="avatar">{initials(currentUser.name)}</div>
            <div>
              <b>{currentUser.name}</b>
              <small>{currentRole === 'admin' ? 'Admin HR' : `${currentUser.username} • ${currentUser.division}`}</small>
            </div>
          </div>
          <div className="nav">
            {currentRole === 'staff' ? (
              <>
                <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><Home size={18} /> Dashboard</button>
                <button className={tab === 'attendance' ? 'active' : ''} onClick={() => setTab('attendance')}><Camera size={18} /> Absensi Online</button>
                <button className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}><ClipboardList size={18} /> Pengajuan</button>
                <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><History size={18} /> Riwayat Saya</button>
              </>
            ) : (
              <>
                <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}><Activity size={18} /> Ringkasan HR</button>
                <button className={tab === 'monitor' ? 'active' : ''} onClick={() => setTab('monitor')}><Users size={18} /> Monitoring</button>
                <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={18} /> Aturan</button>
              </>
            )}
          </div>
          <div className="divider"></div>
          <button className="btn ghost full" onClick={handleLogout}><LogOut size={18} /> Keluar</button>
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <h2>{tab.charAt(0).toUpperCase() + tab.slice(1)}</h2>
              <div className="subtle">{clock}</div>
            </div>
            <div className="live-badge">
              <span className={loading ? "pulse warning" : "pulse"}></span> 
              {loading ? "Syncing..." : "Database Connected"}
            </div>
          </div>

          {/* STAFF VIEWS */}
          {currentRole === 'staff' && (
            <div className="grid">
              {tab === 'home' && (
                <>
                  <div className="grid kpi">
                    {(() => {
                      const rec = records.find(r => r.staff_id === currentUser.id && r.date === todayKey());
                      const calc = calcRecord(rec);
                      return (
                        <>
                          <div className="card kpi-card"><div className="kpi-icon"><Activity /></div><div className="kpi-value">{calc.status}</div><div className="kpi-label">Status hari ini</div></div>
                          <div className="card kpi-card"><div className="kpi-icon"><Clock /></div><div className="kpi-value">{rec?.check_in || "-"}</div><div className="kpi-label">Jam Masuk</div></div>
                          <div className="card kpi-card"><div className="kpi-icon"><LogOut /></div><div className="kpi-value">{rec?.check_out || "-"}</div><div className="kpi-label">Jam Pulang</div></div>
                          <div className="card kpi-card"><div className="kpi-icon"><AlertCircle /></div><div className="kpi-value">{durationLabel(calc.overtimeMins)}</div><div className="kpi-label">Lembur</div></div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="card">
                    <h3>Aktivitas Terakhir (Cloud)</h3>
                    <div className="timeline">
                      {records.filter(r => r.staff_id === currentUser.id).slice(0, 3).map(r => (
                        <div key={r.id} className="timeline-item">
                          <div className="timeline-dot"><CheckCircle size={16} /></div>
                          <div className="timeline-copy">
                            <b>Absensi {fmtDate(r.date)}</b>
                            <span>{r.check_in} - {r.check_out || 'Selesai'} • {r.project}</span>
                          </div>
                        </div>
                      ))}
                      {records.filter(r => r.staff_id === currentUser.id).length === 0 && <div className="empty">Belum ada data di database.</div>}
                    </div>
                  </div>
                </>
              )}

              {tab === 'attendance' && (
                <div className="grid two">
                  <div className="card">
                    <div className="card-title"><h3>Form Absensi Online</h3></div>
                    <div className="form-stack">
                      <div className="grid two">
                        <div className="field"><label>Jam Masuk</label><input type="time" value={attendanceForm.checkIn} onChange={e => setAttendanceForm(prev => ({ ...prev, checkIn: e.target.value }))} /></div>
                        <div className="field"><label>Jam Pulang</label><input type="time" value={attendanceForm.checkOut} onChange={e => setAttendanceForm(prev => ({ ...prev, checkOut: e.target.value }))} /></div>
                      </div>
                      <div className="field"><label>Lokasi Project</label><input value={attendanceForm.project} onChange={e => setAttendanceForm(prev => ({ ...prev, project: e.target.value }))} /></div>
                      <div className="field"><label>Catatan</label><textarea value={attendanceForm.note} onChange={e => setAttendanceForm(prev => ({ ...prev, note: e.target.value }))} /></div>
                      <div className="btn-row">
                        <button className="btn primary" onClick={() => saveAttendance('in')}>Absen Masuk</button>
                        <button className="btn warning" onClick={() => saveAttendance('out')}>Absen Pulang</button>
                      </div>
                    </div>
                  </div>
                  <div className="grid">
                    <div className="card">
                      <h3>Foto Bukti</h3>
                      <div className="photo-box">
                        {photo ? <img src={photo} alt="Selfie" /> : <div className="photo-placeholder">Klik Ambil Foto</div>}
                      </div>
                      <button className="btn soft full" style={{ marginTop: '10px' }} onClick={() => setPhoto(makePhotoData(currentUser.name, attendanceForm.checkIn, attendanceForm.project, initials))}>Ambil Foto Simulasi</button>
                    </div>
                    <div className="card">
                      <h3>Lokasi GPS</h3>
                      <div className="location-preview">
                        {location ? (
                          <><b>{location.address}</b><span>{location.lat}, {location.lng}</span></>
                        ) : (
                          <span>Lokasi belum dideteksi</span>
                        )}
                      </div>
                      <button className="btn soft full" style={{ marginTop: '10px' }} onClick={() => setLocation(makeDemoLocation(currentUser.no))}>Ambil Lokasi Otomatis</button>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'request' && (
                <div className="grid two">
                  <div className="card">
                    <h3>Kirim Pengajuan</h3>
                    <div className="form-stack">
                      <div className="field">
                        <label>Jenis</label>
                        <select value={requestForm.type} onChange={e => setRequestForm(prev => ({ ...prev, type: e.target.value }))}>
                          <option>Cuti</option><option>Izin</option><option>Sakit</option><option>Lembur</option>
                        </select>
                      </div>
                      <div className="field"><label>Tanggal</label><input type="date" value={requestForm.date} onChange={e => setRequestForm(prev => ({ ...prev, date: e.target.value }))} /></div>
                      <div className="field"><label>Alasan</label><textarea value={requestForm.reason} onChange={e => setRequestForm(prev => ({ ...prev, reason: e.target.value }))} /></div>
                      <button className="btn primary" onClick={submitRequest}>Kirim Pengajuan</button>
                    </div>
                  </div>
                  <div className="card">
                    <h3>Riwayat Pengajuan (Cloud)</h3>
                    <div className="grid">
                      {requests.filter(r => r.staff_id === currentUser.id).map(r => (
                        <div key={r.id} className="request-card">
                          <div className="row"><b>{r.type} • {fmtDate(r.date)}</b><span className={`status-pill ${r.status === 'Disetujui' ? 'hadir' : 'menunggu'}`}>{r.status}</span></div>
                          <small>{r.reason}</small>
                        </div>
                      ))}
                      {requests.filter(r => r.staff_id === currentUser.id).length === 0 && <div className="empty">Belum ada pengajuan.</div>}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'history' && (
                <div className="card">
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Lembur</th></tr>
                      </thead>
                      <tbody>
                        {records.filter(r => r.staff_id === currentUser.id).map(r => {
                          const calc = calcRecord(r);
                          return (
                            <tr key={r.id}>
                              <td>{fmtDate(r.date)}</td>
                              <td>{r.check_in}</td>
                              <td>{r.check_out || '-'}</td>
                              <td><span className={`status-pill ${calc.statusClass}`}>{calc.status}</span></td>
                              <td>{durationLabel(calc.overtimeMins)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ADMIN VIEWS */}
          {currentRole === 'admin' && (
            <div className="grid">
              {tab === 'home' && (
                <div className="grid kpi">
                  <div className="card kpi-card"><div className="kpi-icon"><Users /></div><div className="kpi-value">{STAFF.length}</div><div className="kpi-label">Total Staff</div></div>
                  <div className="card kpi-card"><div className="kpi-icon"><CheckCircle /></div><div className="kpi-value">{records.filter(r => r.date === todayKey()).length}</div><div className="kpi-label">Hadir Hari Ini</div></div>
                  <div className="card kpi-card"><div className="kpi-icon"><AlertCircle /></div><div className="kpi-value">{requests.filter(r => r.status === 'Menunggu').length}</div><div className="kpi-label">Butuh Approval</div></div>
                  <div className="card kpi-card"><div className="kpi-icon"><Activity /></div><div className="kpi-value">{Math.round((records.filter(r => r.date === todayKey()).length / STAFF.length) * 100)}%</div><div className="kpi-label">Persentase</div></div>
                </div>
              )}

              {tab === 'monitor' && (
                <div className="card">
                  <div className="table-tools">
                    <div className="left"><div className="search"><Search size={14} /><input placeholder="Cari staff..." /></div></div>
                    <div className="right"><button className="btn ghost"><Filter size={14} /> Filter</button></div>
                  </div>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr><th>Nama</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Lembur</th><th>Aksi</th></tr>
                      </thead>
                      <tbody>
                        {STAFF.map(s => {
                          const rec = records.find(r => r.staff_id === s.id && r.date === todayKey());
                          const calc = calcRecord(rec);
                          return (
                            <tr key={s.id}>
                              <td>
                                <div className="employee-cell">
                                  <div className="mini-avatar">{initials(s.name)}</div>
                                  <div><b>{s.name}</b><br /><small className="muted">{s.division}</small></div>
                                </div>
                              </td>
                              <td>{rec?.check_in || '-'}</td>
                              <td>{rec?.check_out || '-'}</td>
                              <td><span className={`status-pill ${calc.statusClass}`}>{calc.status}</span></td>
                              <td>{durationLabel(calc.overtimeMins)}</td>
                              <td><button className="btn ghost small">Detail</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      {toast.show && <div className="toast show">{toast.message}</div>}
    </div>
  );
}

export default App;
