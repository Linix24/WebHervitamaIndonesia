import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Camera, ClipboardList, History, Users, 
  Activity, Settings, LogOut, CheckCircle, Clock, 
  MapPin, AlertCircle, Search, Filter, MoreHorizontal,
  ChevronDown, Plus, Trash2, Send, DollarSign, CheckSquare, Upload, Image, Navigation, X, User, UserPlus
} from 'lucide-react';
import { STAFF as INITIAL_STAFF, ADMIN, DIVISIONS, LOCATIONS } from './data';
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
  const [view, setView] = useState('login'); 
  const [tab, setTab] = useState('home');
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [clock, setClock] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua status');
  const [detecting, setDetecting] = useState(false);
  
  const [staffList, setStaffList] = useState(INITIAL_STAFF);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null); 

  const [manualForm, setManualForm] = useState({ staffId: '', checkIn: '08:00', checkOut: '', date: todayKey() });
  const [manualPhoto, setManualPhoto] = useState('');
  const [manualLocation, setManualLocation] = useState(null);
  const [newStaffForm, setNewStaffForm] = useState({ name: '', username: '', password: '', division: 'Engineering', workType: 'Kantor', defaultLocation: 'Head Office' });

  const camInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const manualCamRef = useRef(null);
  const manualGalRef = useRef(null);

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [attendanceForm, setAttendanceForm] = useState({ checkIn: '07:58', checkOut: '', project: '', workType: 'Lapangan', note: '' });
  const [photo, setPhoto] = useState('');
  const [location, setLocation] = useState(null);
  const [requestForm, setRequestForm] = useState({ type: 'Cuti', date: todayKey(), reason: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: attData } = await supabase.from('attendance').select('*').order('date', { ascending: false });
      setRecords(attData || []);
      const { data: reqData } = await supabase.from('requests').select('*').order('created_at', { ascending: false });
      setRequests(reqData || []);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const attSub = supabase.channel('a').on('postgres_changes',{event:'*',schema:'public',table:'attendance'},()=>fetchData()).subscribe();
    const reqSub = supabase.channel('r').on('postgres_changes',{event:'*',schema:'public',table:'requests'},()=>fetchData()).subscribe();
    const timer = setInterval(() => {
      setClock(new Date().toLocaleString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => { clearInterval(timer); supabase.removeChannel(attSub); supabase.removeChannel(reqSub); };
  }, []);

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  };

  const handleLogin = (u, p) => {
    const username = (u || loginForm.username).trim().toUpperCase();
    const password = (p || loginForm.password).trim();
    if (username === ADMIN.username && password === ADMIN.password) {
      setCurrentUser(ADMIN); setCurrentRole('admin'); setView('admin'); setTab('home');
      return;
    }
    const staff = staffList.find(s => s.username === username && s.password === password);
    if (staff) {
      setCurrentUser(staff); setCurrentRole('staff'); setView('staff'); setTab('home');
      setAttendanceForm(prev => ({ ...prev, project: staff.defaultLocation }));
    } else showToast("Akun tidak ditemukan.");
  };

  const handleFileChange = (e, target = 'staff') => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (target === 'manual') setManualPhoto(reader.result);
        else setPhoto(reader.result);
        showToast("Foto berhasil dimuat!");
      };
      reader.readAsDataURL(file);
    }
  };

  const detectLocation = (target = 'staff') => {
    if (!navigator.geolocation) { showToast("Browser tidak mendukung GPS."); return; }
    setDetecting(true); showToast("Sedang mendeteksi posisi...");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
        const data = await res.json();
        const address = data.display_name || `${latitude}, ${longitude}`;
        const locObj = { lat: latitude.toFixed(6), lng: longitude.toFixed(6), address };
        if (target === 'manual') setManualLocation(locObj);
        else setLocation(locObj);
        showToast("Lokasi berhasil dideteksi!");
      } catch (e) {
        const locObj = { lat: latitude.toFixed(6), lng: longitude.toFixed(6), address: `Posisi: ${latitude}, ${longitude}` };
        if (target === 'manual') setManualLocation(locObj);
        else setLocation(locObj);
        showToast("Lokasi didapat (tanpa alamat).");
      } finally { setDetecting(false); }
    }, (err) => { showToast("Gagal akses GPS."); setDetecting(false); }, { enableHighAccuracy: true });
  };

  const calcRecord = (record) => {
    if (!record) return { status: 'Belum absen', statusClass: 'menunggu', lateMins: 0, overtimeMins: 0 };
    const start = minutesOf(settings.start) + Number(settings.tolerance || 0);
    const end = minutesOf(settings.end);
    const overtimeStart = minutesOf(settings.overtimeAfter);
    const cin = minutesOf(record.check_in);
    const cout = minutesOf(record.check_out);
    const lateMins = cin !== null && cin > start ? cin - start : 0;
    const overtimeMins = cout !== null && cout >= overtimeStart ? Math.max(0, cout - end) : 0;
    let status = "Sudah absen", statusClass = "hadir";
    if (lateMins > 0) { status = "Telat"; statusClass = "telat"; }
    if (overtimeMins > 0) { status = "Lembur"; statusClass = "lembur"; }
    return { lateMins, overtimeMins, status, statusClass };
  };

  const saveAttendance = async (mode) => {
    const existing = records.find(r => r.staff_id === currentUser.id && r.date === todayKey());
    const cin = attendanceForm.checkIn || nowTime();
    const cout = mode === 'out' ? (attendanceForm.checkOut || nowTime()) : (existing?.check_out || null);
    const payload = {
      staff_id: currentUser.id, staff_name: currentUser.name, date: todayKey(),
      check_in: existing?.check_in || cin, check_out: cout,
      project: attendanceForm.project, work_type: attendanceForm.workType, note: attendanceForm.note,
      photo: photo || makePhotoData(currentUser.name, cin, attendanceForm.project, initials),
      lat: location?.lat, lng: location?.lng, address: location?.address
    };
    const { error } = existing ? await supabase.from('attendance').update(payload).eq('id', existing.id) : await supabase.from('attendance').insert([payload]);
    if (error) showToast("Gagal menyimpan."); else { showToast("Data tersimpan!"); fetchData(); }
  };

  const handleManualSubmit = async () => {
    if (!manualForm.staffId) return showToast("Pilih karyawan!");
    const staff = staffList.find(s => s.id === manualForm.staffId);
    const payload = {
      staff_id: staff.id, staff_name: staff.name,
      date: manualForm.date, check_in: manualForm.checkIn, check_out: manualForm.checkOut || null,
      project: "Manual Input", work_type: "Kantor", note: "Input oleh Admin",
      photo: manualPhoto,
      lat: manualLocation?.lat, lng: manualLocation?.lng, address: manualLocation?.address
    };
    const existing = records.find(r => r.staff_id === staff.id && r.date === manualForm.date);
    const { error } = existing ? await supabase.from('attendance').update(payload).eq('id', existing.id) : await supabase.from('attendance').insert([payload]);
    if (error) showToast("Gagal menyimpan."); else {
      showToast("Berhasil tambah absen!");
      setShowManualModal(false);
      setManualPhoto(''); setManualLocation(null);
      fetchData();
    }
  };

  const handleAddStaff = () => {
    if (!newStaffForm.name || !newStaffForm.username) return showToast("Lengkapi data!");
    const id = `HI-${String(staffList.length + 1).padStart(3, '0')}`;
    const newStaff = { ...newStaffForm, id };
    setStaffList([...staffList, newStaff]);
    setShowAddStaffModal(false);
    setNewStaffForm({ name: '', username: '', password: '', division: 'Engineering', workType: 'Kantor', defaultLocation: 'Head Office' });
    showToast("Karyawan berhasil ditambah!");
  };

  const handleDeleteStaff = (id) => {
    if (confirm("Hapus karyawan ini?")) {
      setStaffList(staffList.filter(s => s.id !== id));
      showToast("Karyawan dihapus.");
    }
  };

  const updateRequestStatus = async (id, status) => {
    await supabase.from('requests').update({ status }).eq('id', id);
    showToast(`Request ${status}!`); fetchData();
  };

  const getStaffStats = (staffId) => {
    const staffRecords = records.filter(r => r.staff_id === staffId);
    const staffRequests = requests.filter(r => r.staff_id === staffId && r.status === 'Disetujui');
    let totalOvertimeMins = 0;
    staffRecords.forEach(r => {
      const calc = calcRecord(r);
      totalOvertimeMins += calc.overtimeMins;
    });
    return {
      present: staffRecords.length,
      izin: staffRequests.filter(r => r.type === 'Izin').length,
      sakit: staffRequests.filter(r => r.type === 'Sakit').length,
      cuti: staffRequests.filter(r => r.type === 'Cuti').length,
      overtime: durationLabel(totalOvertimeMins)
    };
  };

  return (
    <div className="app-shell animate-in">
      <div className="bg-animation">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      {view === 'login' ? (
        <div className="login-layout">
          <div className="hero-card">
            <div className="hero-content">
              <span className="pill">⚡ Full HRIS Prototype</span>
              <h1>Monitoring & Payroll dalam satu dashboard.</h1>
              <p>Sistem ini sekarang mencakup monitoring real-time, approval pengajuan staff, dan rekap payroll otomatis.</p>
              <div className="hero-grid">
                <div className="hero-mini"><b>{staffList.length}</b><span>Staff</span></div>
                <div className="hero-mini"><b>Cloud</b><span>Supabase</span></div>
                <div className="hero-mini"><b>Real-time</b><span>Vite React</span></div>
              </div>
            </div>
          </div>
          <div className="login-card">
            <div className="logo-line">
              <div className="logo"><div className="logo-mark">HI</div><div>Hervitama<br/><span className="muted" style={{fontSize:'12px'}}>Online HRIS</span></div></div>
              <div className="clock" dangerouslySetInnerHTML={{__html: clock.replace(',','<br/>')}}></div>
            </div>
            <h2>Login Portal</h2>
            <div className="form-stack">
              <div className="field"><label>Username</label><input placeholder="Contoh: HI-001" value={loginForm.username} onChange={e=>setLoginForm({...loginForm, username:e.target.value})}/></div>
              <div className="field"><label>Password</label><input type="password" placeholder="Password" value={loginForm.password} onChange={e=>setLoginForm({...loginForm, password:e.target.value})}/></div>
              <button className="btn primary full" onClick={()=>handleLogin()}>Masuk Dashboard</button>
            </div>
            <div className="demo-box">
              <b>Shortcut Login</b>
              <div className="btn-row">
                <button className="btn soft" onClick={()=>handleLogin('HI-001','PW-001')}>Staff (HI-001)</button>
                <button className="btn ghost" onClick={()=>handleLogin('HR-001','HR-2026')}>Admin (HR-001)</button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="layout">
          <aside className="sidebar">
            <div className="logo"><div className="logo-mark">HI</div><div>Hervitama<br/><span className="muted" style={{fontSize:'12px'}}>Online HRIS</span></div></div>
            <div className="user-chip"><div className="avatar">{initials(currentUser.name)}</div><div><b>{currentUser.name}</b><small>{currentRole==='admin'?'Admin HR':currentUser.division}</small></div></div>
            <div className="nav">
              {currentRole === 'staff' ? (
                <>
                  <button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Home size={18}/> Dashboard</button>
                  <button className={tab==='attendance'?'active':''} onClick={()=>setTab('attendance')}><Camera size={18}/> Absensi Online</button>
                  <button className={tab==='request'?'active':''} onClick={()=>setTab('request')}><ClipboardList size={18}/> Pengajuan</button>
                  <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><History size={18}/> Riwayat Saya</button>
                </>
              ) : (
                <>
                  <button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Activity size={18}/> Ringkasan HR</button>
                  <button className={tab==='monitor'?'active':''} onClick={()=>setTab('monitor')}><Users size={18}/> Monitoring Online</button>
                  <button className={tab==='payroll'?'active':''} onClick={()=>setTab('payroll')}><DollarSign size={18}/> Rekap Payroll</button>
                  <button className={tab==='approval'?'active':''} onClick={()=>setTab('approval')}><CheckSquare size={18}/> Approval</button>
                  <button className={tab==='stafflist'?'active':''} onClick={()=>setTab('stafflist')}><Users size={18}/> Akun Staff</button>
                  <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}><Settings size={18}/> Aturan</button>
                </>
              )}
            </div>
            <div className="divider"></div>
            <button className="btn ghost full" onClick={()=>setView('login')}><LogOut size={18}/> Keluar</button>
          </aside>
          <main className="main">
            <div className="topbar">
              <div><h2>{tab==='monitor'?'Monitoring Online':tab==='payroll'?'Rekap Payroll':tab==='stafflist'?'Kelola Akun Staff':tab==='settings'?'Aturan Absensi':tab.charAt(0).toUpperCase()+tab.slice(1)}</h2><small>{clock}</small></div>
              <div className="live-badge"><span className={loading?"pulse warning":"pulse"}></span> {loading?"Syncing...":"Live Cloud"}</div>
            </div>
            <div className="grid animate-slide-up" key={tab}>
              {currentRole === 'admin' ? (
                <>
                  {tab === 'home' && (
                    <>
                      <div className="grid kpi">
                        <div className="card kpi-card"><div className="kpi-icon"><Users/></div><div className="kpi-value">{staffList.length}</div><div className="kpi-label">Total Staff</div></div>
                        <div className="card kpi-card"><div className="kpi-icon"><CheckCircle/></div><div className="kpi-value">{records.filter(r=>r.date===todayKey()).length}</div><div className="kpi-label">Hadir Hari Ini</div></div>
                        <div className="card kpi-card"><div className="kpi-icon"><AlertCircle/></div><div className="kpi-value">{requests.filter(r=>r.status==='Menunggu').length}</div><div className="kpi-label">Butuh Approval</div></div>
                        <div className="card kpi-card"><div className="kpi-icon"><DollarSign/></div><div className="kpi-value">Mei</div><div className="kpi-label">Periode Aktif</div></div>
                      </div>
                      <div className="card">
                        <h3>Ringkasan Kehadiran Bulanan</h3>
                        <div className="mini-metrics" style={{marginTop:'15px'}}>
                          <div className="mini-metric"><b>{records.length}</b><span>Total Absensi</span></div>
                          <div className="mini-metric"><b>{records.filter(r=>calcRecord(r).status==='Telat').length}</b><span>Total Telat</span></div>
                          <div className="mini-metric"><b>{requests.filter(r=>r.status==='Disetujui').length}</b><span>Total Izin/Cuti</span></div>
                          <div className="mini-metric"><b>98%</b><span>Health Rate</span></div>
                        </div>
                      </div>
                    </>
                  )}
                  {tab === 'monitor' && (
                    <div className="card">
                      <div className="table-tools">
                        <div className="left">
                          <div className="search"><Search size={14}/><input placeholder="Cari nama..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
                          <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>
                            <option>Semua status</option><option>Sudah absen</option><option>Telat</option><option>Lembur</option><option>Belum absen</option>
                          </select>
                        </div>
                        <div className="right"><button className="btn primary" onClick={()=>setShowManualModal(true)}><Plus size={14}/> Tambah absen manual</button></div>
                      </div>
                      <div className="data-table-wrap">
                        <table className="data-table">
                          <thead><tr><th>Karyawan</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Telat</th><th>Lembur</th><th>Aksi</th></tr></thead>
                          <tbody>
                            {staffList.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).map(s => {
                              const r = records.find(rec=>rec.staff_id===s.id && rec.date===todayKey());
                              const c = calcRecord(r);
                              return (
                                <tr key={s.id}>
                                  <td><div className="employee-cell"><div className="mini-avatar">{initials(s.name)}</div><div><b>{s.name}</b><br/><small className="muted">{s.division}</small></div></div></td>
                                  <td>{r?.check_in||'-'}</td><td>{r?.check_out||'-'}</td>
                                  <td><span className={`status-pill ${c.statusClass}`}>{c.status}</span></td>
                                  <td>{durationLabel(c.lateMins)}</td><td>{durationLabel(c.overtimeMins)}</td>
                                  <td><button className="btn ghost small" onClick={()=>setSelectedStaff(s)}>Detail</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {tab === 'payroll' && (
                    <div className="card"><h3>Rekap Gaji</h3><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Nama</th><th>Hadir</th><th>Telat</th><th>Lembur</th><th>Total</th></tr></thead><tbody>{staffList.map(s=>(<tr key={s.id}><td>{s.name}</td><td>22</td><td>0m</td><td>5j</td><td><b>Rp 5.750.000</b></td></tr>))}</tbody></table></div></div>
                  )}
                  {tab === 'approval' && (
                    <div className="grid">
                      {requests.map(r=>(<div key={r.id} className="card"><div className="card-title"><div><b>{r.staff_name}</b><br/><small>{r.type} • {fmtDate(r.date)}</small></div><span className={`status-pill ${r.status==='Disetujui'?'hadir':r.status==='Ditolak'?'merah':'menunggu'}`}>{r.status}</span></div><p>{r.reason}</p>{r.status==='Menunggu' && <div className="btn-row"><button className="btn success" onClick={()=>updateRequestStatus(r.id,'Disetujui')}>Setujui</button><button className="btn danger" onClick={()=>updateRequestStatus(r.id,'Ditolak')}>Tolak</button></div>}</div>))}
                      {requests.length === 0 && <div className="empty">Tidak ada pengajuan.</div>}
                    </div>
                  )}
                  {tab === 'stafflist' && (
                    <div className="card">
                      <div className="table-tools">
                        <div className="left"><div className="search"><Search size={14}/><input placeholder="Cari karyawan..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
                        <div className="right"><button className="btn primary" onClick={()=>setShowAddStaffModal(true)}><UserPlus size={16}/> Tambah Staff Baru</button></div>
                      </div>
                      <div className="data-table-wrap"><table className="data-table"><thead><tr><th>ID</th><th>Nama</th><th>Divisi</th><th>Username</th><th>Aksi</th></tr></thead><tbody>{staffList.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())).map(s=>(<tr key={s.id}><td>{s.id}</td><td><b>{s.name}</b></td><td>{s.division}</td><td>{s.username}</td><td><div className="btn-row"><button className="btn ghost small" onClick={()=>setSelectedStaff(s)}>Detail</button><button className="btn danger small" onClick={()=>handleDeleteStaff(s.id)}><Trash2 size={14}/></button></div></td></tr>))}</tbody></table></div>
                    </div>
                  )}
                  {tab === 'settings' && (
                    <div className="grid two">
                      <div className="card">
                        <h3>Aturan Jam Kerja</h3>
                        <div className="form-stack">
                          <div className="grid two">
                            <div className="field"><label>Jam masuk</label><input type="time" value={settings.start} onChange={e=>setSettings({...settings,start:e.target.value})}/></div>
                            <div className="field"><label>Toleransi (menit)</label><input type="number" value={settings.tolerance} onChange={e=>setSettings({...settings,tolerance:e.target.value})}/></div>
                          </div>
                          <div className="grid two">
                            <div className="field"><label>Jam pulang</label><input type="time" value={settings.end} onChange={e=>setSettings({...settings,end:e.target.value})}/></div>
                            <div className="field"><label>Lembur otomatis</label><input type="time" value={settings.overtimeAfter} onChange={e=>setSettings({...settings,overtimeAfter:e.target.value})}/></div>
                          </div>
                          <button className="btn primary full" onClick={()=>showToast("Aturan disimpan!")}>Simpan Aturan</button>
                        </div>
                      </div>
                      <div className="card">
                        <h3>Validasi Prototype</h3>
                        <div className="timeline">
                          <div className="timeline-item"><div className="timeline-dot">1</div><div className="timeline-copy"><b>Staff login personal</b><span>HI-001, HI-002, dst.</span></div></div>
                          <div className="timeline-item"><div className="timeline-dot">2</div><div className="timeline-copy"><b>Input online terstandar</b><span>Foto & GPS real-time.</span></div></div>
                          <div className="timeline-item"><div className="timeline-dot">3</div><div className="timeline-copy"><b>Monitoring HR</b><span>Approval tanpa rekap manual.</span></div></div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
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
                      <div className="card"><h3>Aktivitas Terakhir</h3><div className="timeline">{records.filter(r=>r.staff_id===currentUser.id).slice(0,3).map(r=>(<div key={r.id} className="timeline-item"><div className="timeline-dot"><CheckCircle size={16}/></div><div className="timeline-copy"><b>{fmtDate(r.date)}</b><span>{r.check_in} - {r.check_out||'Aktif'}</span></div></div>))}</div></div>
                    </>
                  )}
                  {tab === 'attendance' && (
                    <div className="grid two">
                      <div className="card">
                        <h3>Absensi Online</h3>
                        <div className="form-stack">
                          <div className="grid two">
                            <div className="field"><label>Masuk</label><input type="time" value={attendanceForm.checkIn} onChange={e=>setAttendanceForm({...attendanceForm, checkIn:e.target.value})}/></div>
                            <div className="field"><label>Pulang</label><input type="time" value={attendanceForm.checkOut} onChange={e=>setAttendanceForm({...attendanceForm, checkOut:e.target.value})}/></div>
                          </div>
                          <div className="field"><label>Project</label><input value={attendanceForm.project} onChange={e=>setAttendanceForm({...attendanceForm, project:e.target.value})}/></div>
                          <div className="field"><label>Catatan</label><textarea value={attendanceForm.note} onChange={e=>setAttendanceForm({...attendanceForm, note:e.target.value})}/></div>
                          <div className="btn-row"><button className="btn primary" onClick={()=>saveAttendance('in')}>Absen Masuk</button><button className="btn warning" onClick={()=>saveAttendance('out')}>Absen Pulang</button></div>
                        </div>
                      </div>
                      <div className="grid">
                        <div className="card">
                          <h3>Bukti Foto</h3>
                          <div className="photo-box">{photo?<img src={photo}/>:<div className="photo-placeholder">Ambil Foto</div>}</div>
                          <input type="file" accept="image/*" capture="environment" style={{display:'none'}} ref={camInputRef} onChange={handleFileChange} />
                          <input type="file" accept="image/*" style={{display:'none'}} ref={galleryInputRef} onChange={handleFileChange} />
                          <div className="btn-row" style={{marginTop:'12px'}}><button className="btn soft" style={{flex:1}} onClick={()=>camInputRef.current.click()}><Camera size={16}/> Kamera</button><button className="btn ghost" style={{flex:1}} onClick={()=>galleryInputRef.current.click()}><Image size={16}/> Galeri</button></div>
                        </div>
                        <div className="card">
                          <h3>GPS Lokasi</h3>
                          <div className="location-preview">{detecting ? 'Mencari...' : (location ? location.address : 'Belum terdeteksi')}</div>
                          <button className="btn soft full" onClick={detectLocation} disabled={detecting}><Navigation size={16}/> Deteksi Lokasi</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {tab === 'request' && (
                    <div className="grid two">
                      <div className="card"><h3>Kirim Pengajuan</h3><div className="form-stack"><div className="field"><label>Tipe</label><select value={requestForm.type} onChange={e=>setRequestForm({...requestForm, type:e.target.value})}><option>Cuti</option><option>Izin</option><option>Sakit</option></select></div><div className="field"><label>Tanggal</label><input type="date" value={requestForm.date} onChange={e=>setRequestForm({...requestForm, date:e.target.value})}/></div><div className="field"><label>Alasan</label><textarea value={requestForm.reason} onChange={e=>setRequestForm({...requestForm, reason:e.target.value})}/></div><button className="btn primary full" onClick={async()=>{await supabase.from('requests').insert([{...requestForm, staff_id:currentUser.id, staff_name:currentUser.name, status:'Menunggu'}]); showToast("Terkirim!"); fetchData();}}>Kirim</button></div></div>
                      <div className="card"><h3>Riwayat Pengajuan</h3>{requests.filter(r=>r.staff_id===currentUser.id).map(r=>(<div key={r.id} style={{marginBottom:'10px'}}><b>{r.type}</b> ({r.status})</div>))}</div>
                    </div>
                  )}
                  {tab === 'history' && (
                    <div className="card"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th><th>Status</th></tr></thead><tbody>{records.filter(r=>r.staff_id===currentUser.id).map(r=><tr key={r.id}><td>{fmtDate(r.date)}</td><td>{r.check_in}</td><td>{r.check_out||'-'}</td><td>{calcRecord(r).status}</td></tr>)}</tbody></table></div></div>
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      )}

      {/* Modals are FIXED and RESTORED here */}
      {showManualModal && (
        <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'900px'}}>
          <div className="modal-head"><h3>Tambah Absen Manual</h3><button className="btn ghost small" onClick={()=>setShowManualModal(false)}><X size={18}/></button></div>
          <div className="modal-body"><div className="grid two"><div className="form-stack">
            <div className="field"><label>Pilih Karyawan</label><select value={manualForm.staffId} onChange={e=>setManualForm({...manualForm, staffId:e.target.value})}><option value="">-- Pilih --</option>{staffList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label>Tanggal</label><input type="date" value={manualForm.date} onChange={e=>setManualForm({...manualForm, date:e.target.value})}/></div>
            <div className="grid two"><div className="field"><label>Masuk</label><input type="time" value={manualForm.checkIn} onChange={e=>setManualForm({...manualForm, checkIn:e.target.value})}/></div><div className="field"><label>Pulang</label><input type="time" value={manualForm.checkOut} onChange={e=>setManualForm({...manualForm, checkOut:e.target.value})}/></div></div>
            <div className="card" style={{background:'#f8faff'}}><div className="location-preview">{detecting?'Mencari...':(manualLocation?manualLocation.address:'Belum ada')}</div><button className="btn soft full" onClick={()=>detectLocation('manual')}><Navigation size={16}/> Deteksi</button></div>
            <button className="btn primary full" onClick={handleManualSubmit}>Simpan Absen</button>
          </div><div className="card"><h3>Foto</h3><div className="photo-box">{manualPhoto?<img src={manualPhoto}/>:<div className="photo-placeholder">No Photo</div>}</div><div className="btn-row"><button className="btn soft" onClick={()=>manualCamRef.current.click()}>Kamera</button></div><input type="file" capture="environment" style={{display:'none'}} ref={manualCamRef} onChange={e=>handleFileChange(e,'manual')}/></div></div></div>
        </div></div>
      )}
      {showAddStaffModal && (
        <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'500px'}}>
          <div className="modal-head"><h3>Tambah Staff Baru</h3><button className="btn ghost small" onClick={()=>setShowAddStaffModal(false)}><X size={18}/></button></div>
          <div className="modal-body"><div className="form-stack">
            <div className="field"><label>Nama Lengkap</label><input value={newStaffForm.name} onChange={e=>setNewStaffForm({...newStaffForm, name:e.target.value})}/></div>
            <div className="field"><label>Username</label><input value={newStaffForm.username} onChange={e=>setNewStaffForm({...newStaffForm, username:e.target.value.toUpperCase()})}/></div>
            <div className="field"><label>Password</label><input type="password" value={newStaffForm.password} onChange={e=>setNewStaffForm({...newStaffForm, password:e.target.value})}/></div>
            <div className="field"><label>Divisi</label><select value={newStaffForm.division} onChange={e=>setNewStaffForm({...newStaffForm, division:e.target.value})}>{DIVISIONS.map(d=><option key={d} value={d}>{d}</option>)}</select></div>
            <button className="btn primary full" onClick={handleAddStaff}>Daftarkan</button>
          </div></div>
        </div></div>
      )}
      {selectedStaff && (
        <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'600px'}}>
          <div className="modal-head"><h3>Profil {selectedStaff.name}</h3><button className="btn ghost small" onClick={()=>setSelectedStaff(null)}><X size={18}/></button></div>
          <div className="modal-body">
            <div className="user-chip" style={{background:'#f8faff', padding:'20px', borderRadius:'22px'}}><div className="avatar">{initials(selectedStaff.name)}</div><div><b>{selectedStaff.name}</b><br/><small>{selectedStaff.username}</small></div></div>
            <h4 style={{marginTop:'20px'}}>Rekap Kehadiran</h4>
            <div className="grid two">
              {(() => { const s = getStaffStats(selectedStaff.id); return (<><div className="card"><b>{s.present}</b><small> Hadir</small></div><div className="card"><b>{s.overtime}</b><small> Lembur</small></div></>); })()}
            </div>
            <button className="btn ghost full" onClick={()=>setSelectedStaff(null)}>Tutup</button>
          </div>
        </div></div>
      )}
      {toast.show && <div className="toast show animate-in">{toast.message}</div>}
    </div>
  );
}

export default App;
