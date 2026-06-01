import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, Camera, ClipboardList, History, Users, 
  Activity, Settings, LogOut, CheckCircle, Clock, 
  MapPin, AlertCircle, Search, Filter, MoreHorizontal,
  ChevronDown, Plus, Trash2, Send, DollarSign, CheckSquare, Upload, Image, Navigation, X, User, UserPlus, Info, Calendar, Heart, MessageSquare, Download
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ADMIN, DIVISIONS, LOCATIONS } from './data';
import { 
  todayKey, nowTime, fmtDate, initials, 
  minutesOf, durationLabel, cryptoId, 
  makePhotoData, makeDemoLocation 
} from './utils';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

const DEFAULT_SETTINGS = { start: "08:00", tolerance: 10, end: "17:00", overtimeAfter: "17:30" };

const parseReason = (reasonStr) => {
  try {
    if (reasonStr && reasonStr.trim().startsWith('{')) {
      const parsed = JSON.parse(reasonStr);
      return {
        title: parsed.title || '',
        description: parsed.description || '',
        attachment: parsed.attachment || '',
        revisionNote: parsed.revisionNote || '',
        isRevised: !!parsed.isRevised
      };
    }
  } catch (e) {}
  return { title: '', description: reasonStr || '', attachment: '', revisionNote: '', isRevised: false };
};


const getChartData = (records, settings, numDays = 7) => {
  const map = {};
  const d = new Date();
  const start = minutesOf(settings.start) + Number(settings.tolerance || 0);

  for (let i = numDays - 1; i >= 0; i--) {
    const day = new Date(d);
    day.setDate(day.getDate() - i);
    const y = day.getFullYear();
    const m = String(day.getMonth() + 1).padStart(2, "0");
    const da = String(day.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${da}`;
    
    map[key] = { 
      date: key, 
      display: numDays > 7 ? `${day.getDate()} ${day.toLocaleDateString('id-ID', {month:'short'})}` : day.toLocaleDateString('id-ID', {weekday:'short'}), 
      Hadir: 0, 
      Telat: 0,
      PulangNormal: 0,
      Lembur: 0
    };
  }
  
  records.forEach(r => {
    if (map[r.date]) {
      // Presensi Datang
      const cin = minutesOf(r.check_in);
      const isLate = cin !== null && cin > start;
      if (isLate) map[r.date].Telat += 1;
      else if (cin !== null) map[r.date].Hadir += 1;

      // Presensi Pulang
      if (r.check_out) {
        const cout = minutesOf(r.check_out);
        const end = minutesOf(settings.end);
        const overtimeStart = minutesOf(settings.overtimeAfter);
        const isOvertime = cout !== null && cout >= overtimeStart;
        if (isOvertime) map[r.date].Lembur += 1;
        else map[r.date].PulangNormal += 1;
      }
    }
  });
  
  return Object.values(map).sort((a,b) => a.date.localeCompare(b.date));
};

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentRole, setCurrentRole] = useState(null);
  const [view, setView] = useState('login'); 
  const [tab, setTab] = useState('home');
  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [staffList, setStaffList] = useState([]); // Sekarang dari Supabase
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [clock, setClock] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua status');
  const [detecting, setDetecting] = useState(false);
  
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null); 
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [detailList, setDetailList] = useState(null); 
  const [editingRequest, setEditingRequest] = useState(null);
  const [showRevisionModal, setShowRevisionModal] = useState(null);
  const [showStaffOvertimeModal, setShowStaffOvertimeModal] = useState(false);
  const [revisionInput, setRevisionInput] = useState('');
  const [chartDays, setChartDays] = useState(7); 
  const [chartType, setChartType] = useState('datang'); 
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  
  const currentD = new Date();
  const initMonth = `${currentD.getFullYear()}-${String(currentD.getMonth() + 1).padStart(2, '0')}`;
  const [reportMonth, setReportMonth] = useState(initMonth);

  const [manualForm, setManualForm] = useState({ staffId: '', checkIn: '08:00', checkOut: '', date: todayKey() });
  const [manualPhoto, setManualPhoto] = useState('');
  const [manualLocation, setManualLocation] = useState(null);
  const [newStaffForm, setNewStaffForm] = useState({ name: '', username: '', password: '', division: 'Engineering', workType: 'Kantor', defaultLocation: 'Head Office' });

  const camInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const manualCamRef = useRef(null);
  const manualGalRef = useRef(null);
  const requestFileRef = useRef(null);


  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [attendanceForm, setAttendanceForm] = useState({ checkIn: '', checkOut: '', project: 'WFO (Head Office)', workType: 'Kantor', note: '' });
  const [photo, setPhoto] = useState('');
  const [location, setLocation] = useState(null);
  const [requestForm, setRequestForm] = useState({ type: 'Cuti', date: todayKey(), reason: '' });
  const [requestTitle, setRequestTitle] = useState('');
  const [requestAttachment, setRequestAttachment] = useState('');


  const fetchData = async () => {
    setLoading(true);
    try {
      // Ambil data staff
      const { data: staffData } = await supabase.from('staff').select('*').order('id', { ascending: true });
      setStaffList(staffData || []);

      // Ambil data absensi
      const { data: attData } = await supabase.from('attendance').select('*').order('date', { ascending: false });
      setRecords(attData || []);

      // Ambil data request
      const { data: reqData } = await supabase.from('requests').select('*').order('created_at', { ascending: false });
      setRequests(reqData || []);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const attSub = supabase.channel('a').on('postgres_changes',{event:'*',schema:'public',table:'attendance'},()=>fetchData()).subscribe();
    const reqSub = supabase.channel('r').on('postgres_changes',{event:'*',schema:'public',table:'requests'},()=>fetchData()).subscribe();
    const staffSub = supabase.channel('s').on('postgres_changes',{event:'*',schema:'public',table:'staff'},()=>fetchData()).subscribe();
    
    const timer = setInterval(() => {
      setClock(new Date().toLocaleString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => { clearInterval(timer); supabase.removeChannel(attSub); supabase.removeChannel(reqSub); supabase.removeChannel(staffSub); };
  }, []);

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 3000);
  };

  const handleLogin = async (u, p) => {
    const username = (u || loginForm.username).trim().toUpperCase();
    const password = (p || loginForm.password).trim();
    
    if (username === ADMIN.username && password === ADMIN.password) {
      setCurrentUser(ADMIN); setCurrentRole('admin'); setView('admin'); setTab('home');
      return;
    }

    // Cek ke Database Supabase
    const { data: staff, error } = await supabase
      .from('staff')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (staff) {
      setCurrentUser(staff); setCurrentRole('staff'); setView('staff'); setTab('home');
      setAttendanceForm(prev => ({ ...prev, project: 'WFO (Head Office)' }));
    } else {
      showToast("Akun tidak ditemukan atau password salah.");
    }
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
    if (!record.check_in && !record.check_out) {
      let st = 'Belum absen';
      let cls = 'menunggu';
      if (record.note && record.note.toLowerCase().includes('cuti')) { st = 'Cuti'; cls = 'izin'; }
      if (record.note && record.note.toLowerCase().includes('sakit')) { st = 'Sakit'; cls = 'izin'; }
      return { status: st, statusClass: cls, lateMins: 0, overtimeMins: 0 };
    }
    const start = minutesOf(settings.start) + Number(settings.tolerance || 0);
    const end = minutesOf(settings.end);
    const overtimeStart = minutesOf(settings.overtimeAfter);
    const cin = minutesOf(record.check_in);
    const cout = minutesOf(record.check_out);
    const lateMins = cin !== null && cin > start ? cin - start : 0;
    const overtimeMins = cout !== null && cout >= overtimeStart ? Math.max(0, cout - end) : 0;
    let status = "Hadir", statusClass = "hadir";
    if (lateMins > 0) { status = "Telat"; statusClass = "telat"; }
    if (overtimeMins > 0) { status = "Lembur"; statusClass = "lembur"; }
    if (record.note && record.note.includes('Absensi Sabtu')) { status = "Hadir (1/2 Hari)"; statusClass = "hadir"; }
    if (record.note && record.note.toLowerCase().includes('izin')) { status = record.note; statusClass = "izin"; }
    return { lateMins, overtimeMins, status, statusClass };
  };

  const saveAttendance = async (mode) => {
    const existing = records.find(r => r.staff_id === currentUser.id && r.date === todayKey());
    const cin = attendanceForm.checkIn || nowTime();
    const cout = mode === 'out' ? (attendanceForm.checkOut || nowTime()) : (existing?.check_out || null);
    
    setAttendanceForm(prev => ({ ...prev, checkIn: cin, checkOut: cout || '' }));

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

  const handleAddStaff = async () => {
    if (!newStaffForm.name || !newStaffForm.username) return showToast("Lengkapi data!");
    
    // Generate ID unik berbasis jumlah staff
    const { count } = await supabase.from('staff').select('*', { count: 'exact', head: true });
    const id = `HI-${String((count || 0) + 1).padStart(3, '0')}`;
    
    const { error } = await supabase.from('staff').insert([{
      id,
      name: newStaffForm.name,
      username: newStaffForm.username.toUpperCase(),
      password: newStaffForm.password,
      division: newStaffForm.division
    }]);

    if (error) {
      showToast("Gagal menambah staff (Username mungkin sudah ada).");
    } else {
      showToast("Staff berhasil ditambahkan permanen!");
      setShowAddStaffModal(false);
      setNewStaffForm({ name: '', username: '', password: '', division: 'Engineering', workType: 'Kantor', defaultLocation: 'Head Office' });
      fetchData();
    }
  };

  const handleDeleteStaff = async (id) => {
    if (confirm("Hapus karyawan ini secara permanen dari database?")) {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) showToast("Gagal menghapus.");
      else { showToast("Karyawan dihapus."); fetchData(); }
    }
  };

  const handleRequestFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setRequestAttachment(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const updateRequestStatus = async (id, status, revisionNote = '') => {
    if (status === 'Revisi') {
      const { data: req } = await supabase.from('requests').select('reason').eq('id', id).single();
      if (req) {
        const parsed = parseReason(req.reason);
        parsed.revisionNote = revisionNote;
        parsed.isRevised = false;
        await supabase.from('requests').update({ status, reason: JSON.stringify(parsed) }).eq('id', id);
      }
    } else {
      await supabase.from('requests').update({ status }).eq('id', id);
    }
    showToast(`Request ${status === 'Revisi' ? 'Revisi Diminta' : status}!`); fetchData();
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

  const filteredStaff = staffList.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter === 'Semua status') return true;
    const r = records.find(rec => rec.staff_id === s.id && rec.date === todayKey());
    const c = calcRecord(r);
    return c.status === statusFilter;
  });
    
  const activeDaysInMonth = new Set(records.filter(r => r.date.startsWith(reportMonth)).map(r => r.date)).size;
  const activeStaffInMonth = new Set(records.filter(r => r.date.startsWith(reportMonth)).map(r => r.staff_id)).size;
  const displayWorkingDays = activeDaysInMonth > 0 ? activeDaysInMonth : 21;
  const displayActiveStaff = activeStaffInMonth > 0 ? activeStaffInMonth : staffList.length;

  const pdfChartRef = useRef(null);

  const handleDownloadExcel = () => {
    const [y, m] = reportMonth.split('-');
    const monthPrefix = reportMonth;
    const daysInMonth = new Date(y, parseInt(m), 0).getDate();
    
    const excelData = staffList.map((s, i) => {
      const row = { No: i + 1, Nama: s.name, Divisi: s.division };
      let hadir = 0, sakit = 0, cuti = 0, terlambat = 0, lemburMins = 0;
      
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`;
        const dateObj = new Date(dateStr);
        const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
        
        const rec = records.find(r => r.staff_id === s.id && r.date === dateStr);
        if (rec) {
          const calc = calcRecord(rec);
          if (calc.status === 'Hadir' || calc.status === 'Lembur' || calc.status === 'Telat') {
            row[day] = '✓';
            hadir++;
            if (calc.lateMins > 0) terlambat++;
            if (calc.overtimeMins > 0) lemburMins += calc.overtimeMins;
          } else if (calc.status.includes('Sakit')) {
            row[day] = 'S';
            sakit++;
          } else if (calc.status.includes('Cuti')) {
            row[day] = 'C';
            cuti++;
          } else {
             row[day] = 'H';
             hadir++;
          }
        } else {
          row[day] = isWeekend ? 'L' : '-';
        }
      }
      row['Hadir'] = hadir;
      row['Sakit'] = sakit;
      row['Cuti'] = cuti;
      row['Terlambat'] = terlambat;
      row['Lembur (Jam)'] = (lemburMins / 60).toFixed(1);
      row['Persentase (%)'] = Math.round((hadir / 22) * 100) + '%';
      
      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Rekap ${monthPrefix}`);
    XLSX.writeFile(workbook, `Absen_Karyawan_${monthPrefix}.xlsx`);
  };

  const handleDownloadPDF = async () => {
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const monthPrefix = reportMonth;
    const d = new Date();
    
    doc.setFontSize(22);
    doc.setTextColor(30, 64, 175);
    doc.text(`Laporan Rekap Bulanan HRIS - ${monthPrefix}`, 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Dicetak pada: ${d.toLocaleString('id-ID')}`, 14, 28);
    
    if (pdfChartRef.current) {
      const canvas = await html2canvas(pdfChartRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', 14, 35, 150, 40);
    }
    
    const tableData = staffList.map((s, i) => {
      const sRecords = records.filter(r => r.staff_id === s.id && r.date.startsWith(monthPrefix));
      let hadir = 0, late = 0, over = 0;
      sRecords.forEach(r => {
        const c = calcRecord(r);
        if (c.status === 'Hadir' || c.status === 'Lembur' || c.status === 'Telat') hadir++;
        if (c.lateMins > 0) late++;
        if (c.overtimeMins > 0) over += c.overtimeMins;
      });
      return [
        i + 1,
        s.name,
        s.division,
        `${hadir} Hari`,
        `${late}x Telat`,
        `${Math.floor(over/60)}j ${over%60}m`,
        Math.round((hadir / 22) * 100) + '%'
      ];
    });
    
    doc.autoTable({
      startY: pdfChartRef.current ? 85 : 40,
      head: [['No', 'Nama Karyawan', 'Divisi', 'Kehadiran', 'Keterlambatan', 'Total Lembur', 'Persentase']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], fontSize: 10, halign: 'center' },
      bodyStyles: { fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      styles: { cellPadding: 4 }
    });
    
    doc.save(`Laporan_PDF_${monthPrefix}.pdf`);
  };

  return (
    <>
      <div className="bg-animation">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>

      <div className="app-shell animate-in">
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
              <div className="logo"><div className="logo-mark">HI</div><div>Hervitama HRIS<br/><span className="muted" style={{fontSize:'12px'}}>Live prototype demo</span></div></div>
              <div className="user-chip">
                <div className="avatar">{initials(currentUser.name)}</div>
                <div><b>{currentUser.name}</b><br/><small>{currentRole==='admin'?'Administrator':currentUser.division}</small></div>
              </div>

              <div className="nav">
                {currentRole === 'staff' ? (
                  <>
                    <div className="nav-label">Akun Karyawan</div>
                    <button className={tab==='attendance'?'active':''} onClick={()=>setTab('attendance')}><MapPin size={18} color="#ec4899"/> Absen Hari Ini</button>
                    <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><Clock size={18} color="#6366f1"/> Riwayat Saya</button>
                    <button className={tab==='request'?'active':''} onClick={()=>setTab('request')}><ClipboardList size={18} color="#f59e0b"/> Pengajuan</button>
                    <button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><User size={18} color="#8b5cf6"/> Profil & Jadwal</button>
                  </>
                ) : (
                  <>
                    <div className="nav-label">Manajemen HR</div>
                    <button className={tab==='home'?'active':''} onClick={()=>setTab('home')}><Activity size={18} color="#3b82f6"/> Ringkasan HR</button>
                    <button className={tab==='monitor'?'active':''} onClick={()=>setTab('monitor')}><Users size={18} color="#06b6d4"/> Monitoring Online</button>
                    <button className={tab==='payroll'?'active':''} onClick={()=>setTab('payroll')}><DollarSign size={18} color="#eab308"/> Rekap Payroll</button>
                    <button className={tab==='approval'?'active':''} onClick={()=>setTab('approval')}><CheckSquare size={18} color="#10b981"/> Approval</button>
                    <button className={tab==='stafflist'?'active':''} onClick={()=>setTab('stafflist')}><Users size={18} color="#f43f5e"/> Akun Staff</button>
                    <button className={tab==='settings'?'active':''} onClick={()=>setTab('settings')}><Settings size={18} color="#64748b"/> Aturan</button>
                  </>
                )}
              </div>

              <div className="divider" style={{background:'rgba(255,255,255,0.05)'}}></div>
              <button className="nav button btn-logout" onClick={()=>setView('login')}>
                <LogOut size={18} color="#ffffff"/> Keluar
              </button>
            </aside>
            <main className="main">
              <div className="topbar">
                <div><h2>{tab==='monitor'?'Monitoring Online':tab==='payroll'?'Rekap Payroll':tab==='stafflist'?'Kelola Akun Staff':tab==='settings'?'Aturan Absensi':tab.charAt(0).toUpperCase()+tab.slice(1)}</h2><small>{clock}</small></div>
                <div className="live-badge">
                  <small style={{opacity:0.5, marginRight:'10px'}}>v2.1.0-updated</small>
                  <span className={loading?"pulse warning":"pulse"}></span> {loading?"Syncing...":"Live Cloud"}
                </div>
              </div>
              <div className="grid animate-slide-up" key={tab}>
                {currentRole === 'admin' ? (
                  <>
                    {tab === 'home' && (
                      <>
                        <div className="grid kpi">
                          <div className="card kpi-card"><div className="kpi-icon"><Users/></div><div className="kpi-value">{staffList.length}</div><div className="kpi-label">Total Staff</div></div>
                          <div className="card kpi-card" style={{cursor:'pointer', transition:'0.2s', transform:'translateY(0)'}} onClick={() => {
                            const data = records.filter(r=>r.date===todayKey()).map(r=>({ name: r.staff_name, detail: `Masuk: ${r.check_in || '-'}` }));
                            setDetailList({ title: 'Hadir Hari Ini', data });
                          }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-5px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}><div className="kpi-icon"><CheckCircle/></div><div className="kpi-value">{records.filter(r=>r.date===todayKey()).length}</div><div className="kpi-label">Hadir Hari Ini</div></div>
                          <div className="card kpi-card" style={{cursor:'pointer', transition:'0.2s', transform:'translateY(0)'}} onClick={() => {
                            const data = requests.filter(r=>r.status==='Menunggu').map(r=>({ name: r.staff_name, detail: `${r.type} • ${fmtDate(r.date)}` }));
                            setDetailList({ title: 'Butuh Approval', data });
                          }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-5px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}><div className="kpi-icon"><AlertCircle/></div><div className="kpi-value">{requests.filter(r=>r.status==='Menunggu').length}</div><div className="kpi-label">Butuh Approval</div></div>
                          <div className="card kpi-card" style={{cursor:'pointer', transition:'0.2s', transform:'translateY(0)'}} onClick={() => { setShowMonthlyReport(true); setReportSearch(''); }} onMouseOver={e=>e.currentTarget.style.transform='translateY(-5px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}><div className="kpi-icon"><DollarSign/></div><div className="kpi-value">{new Date().toLocaleString('id-ID', { month: 'long' })}</div><div className="kpi-label">Periode Aktif (Rekap)</div></div>
                        </div>
                         <div className="card">
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'15px', marginBottom:'20px'}}>
                            <div style={{display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap'}}>
                              <h3>Tren Kehadiran</h3>
                              <select 
                                value={chartDays} 
                                onChange={e=>setChartDays(Number(e.target.value))} 
                                style={{padding:'6px 12px', borderRadius:'8px', border:'1px solid #e2e8f0', background:'white', fontSize:'13px', outline:'none', cursor:'pointer', fontWeight:'500', color:'#475569'}}
                              >
                                <option value={7}>7 Hari Terakhir</option>
                                <option value={14}>14 Hari Terakhir</option>
                                <option value={30}>1 Bulan Terakhir</option>
                              </select>
                              
                              <div style={{margin: 0, padding: '2px', background: '#f1f5f9', borderRadius: '10px', display: 'inline-flex', border: '1px solid #e2e8f0'}}>
                                <button 
                                  className={`btn ${chartType === 'datang' ? 'primary' : 'ghost'} small`} 
                                  onClick={() => setChartType('datang')}
                                  style={{padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border:'none', boxShadow: chartType === 'datang' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', background: chartType === 'datang' ? 'var(--brand)' : 'transparent', color: chartType === 'datang' ? 'white' : '#64748b'}}
                                >
                                  Presensi Datang
                                </button>
                                <button 
                                  className={`btn ${chartType === 'pulang' ? 'primary' : 'ghost'} small`} 
                                  onClick={() => setChartType('pulang')}
                                  style={{padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border:'none', boxShadow: chartType === 'pulang' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', background: chartType === 'pulang' ? 'var(--brand)' : 'transparent', color: chartType === 'pulang' ? 'white' : '#64748b'}}
                                >
                                  Presensi Pulang
                                </button>
                              </div>
                            </div>
                            <div className="mini-metrics" style={{margin:0}}>
                              <div className="mini-metric" style={{padding:'8px 15px', cursor:'pointer'}} onClick={() => {
                                const data = records.slice(0, 20).map(r => ({ name: r.staff_name, detail: `Tgl: ${fmtDate(r.date)} • ${r.check_in}` }));
                                setDetailList({ title: 'Total Absensi (20 Data Terakhir)', data });
                              }}><b>{records.length}</b><span>Total Absensi</span></div>
                              <div className="mini-metric" style={{padding:'8px 15px', cursor:'pointer'}} onClick={() => {
                                const data = records.filter(r=>calcRecord(r).status==='Telat').slice(0, 20).map(r => ({ name: r.staff_name, detail: `Tgl: ${fmtDate(r.date)} • Telat: ${r.check_in}` }));
                                setDetailList({ title: 'Rincian Telat', data });
                              }}><b>{records.filter(r=>calcRecord(r).status==='Telat').length}</b><span>Total Telat</span></div>
                              <div className="mini-metric" style={{padding:'8px 15px', cursor:'pointer'}} onClick={() => {
                                const data = requests.filter(r=>r.status==='Disetujui').slice(0, 20).map(r => ({ name: r.staff_name, detail: `${r.type} • ${fmtDate(r.date)}` }));
                                setDetailList({ title: 'Izin/Cuti Terakhir', data });
                              }}><b>{requests.filter(r=>r.status==='Disetujui').length}</b><span>Izin/Cuti</span></div>
                              <div className="mini-metric" style={{padding:'8px 15px', cursor:'pointer'}} onClick={() => {
                                const data = records.filter(r=>calcRecord(r).overtimeMins > 0).slice(0, 20).map(r => {
                                  const calc = calcRecord(r);
                                  return { name: r.staff_name, detail: `Tgl: ${fmtDate(r.date)} • Durasi: ${durationLabel(calc.overtimeMins)} (Pulang: ${r.check_out})` };
                                });
                                setDetailList({ title: 'Karyawan Lembur (20 Data Terakhir)', data });
                              }}><b>{records.filter(r=>calcRecord(r).overtimeMins > 0).length}</b><span>Total Lembur</span></div>
                            </div>
                          </div>
                          <div style={{width:'100%', height: 320, marginTop: '10px'}}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={getChartData(records, settings, chartDays)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="colorHadir" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="colorTelat" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="colorLembur" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2}/>
                                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis dataKey="display" axisLine={false} tickLine={false} tick={{fill:'#94a3b8', fontSize:12}} dy={10} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill:'#94a3b8', fontSize:12}} />
                                <Tooltip contentStyle={{background:'rgba(255,255,255,0.9)', borderRadius:'12px', border:'1px solid rgba(0,0,0,0.05)', boxShadow:'0 8px 30px rgba(0,0,0,0.12)', backdropFilter:'blur(10px)'}} />
                                {chartType === 'datang' ? (
                                  <>
                                    <Area name="Tepat Waktu" type="monotone" dataKey="Hadir" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorHadir)" />
                                    <Area name="Terlambat" type="monotone" dataKey="Telat" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorTelat)" />
                                  </>
                                ) : (
                                  <>
                                    <Area name="Pulang Standar" type="monotone" dataKey="PulangNormal" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorHadir)" />
                                    <Area name="Lembur" type="monotone" dataKey="Lembur" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorLembur)" />
                                  </>
                                )}
                              </AreaChart>
                            </ResponsiveContainer>
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
                              <option value="Semua status">Semua status</option>
                              <option value="Sudah absen">Sudah absen</option>
                              <option value="Telat">Telat</option>
                              <option value="Lembur">Lembur</option>
                              <option value="Belum absen">Belum absen</option>
                            </select>
                          </div>
                          <div className="right"><button className="btn primary" onClick={()=>setShowManualModal(true)}><Plus size={14}/> Tambah absen manual</button></div>
                        </div>
                        <div className="data-table-wrap">
                          <table className="data-table">
                            <thead><tr><th>Karyawan</th><th>Masuk</th><th>Pulang</th><th>Status</th><th>Telat</th><th>Lembur</th><th>Aksi</th></tr></thead>
                            <tbody>
                              {filteredStaff.map(s => {
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
                              {filteredStaff.length === 0 && <tr><td colSpan="7" style={{textAlign:'center', padding:'40px'}}><div className="muted">Tidak ada data yang cocok dengan filter.</div></td></tr>}
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
                        {requests.map(r => {
                          const parsed = parseReason(r.reason);
                          return (
                            <div key={r.id} className="card" style={{display:'flex', flexDirection:'column', justifyContent:'space-between'}}>
                              <div>
                                <div className="card-title" style={{marginBottom:'12px'}}>
                                  <div>
                                    <div style={{display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap'}}>
                                      <b>{r.staff_name}</b>
                                      {parsed.isRevised && (
                                        <span className="status-pill hadir" style={{fontSize:'10px', padding:'2px 8px', fontWeight:'700'}}>✨ Telah Direvisi</span>
                                      )}
                                    </div>
                                    <small style={{fontSize:'12px', color:'#4b5563', fontWeight:'600'}}>
                                      {r.type === 'Lainnya' ? `Lainnya: ${parsed.title || 'Tanpa Judul'}` : r.type} • {fmtDate(r.date)}
                                    </small>
                                  </div>
                                  <span className={`status-pill ${r.status==='Disetujui'?'hadir':r.status==='Ditolak'?'merah':r.status==='Revisi'?'telat':'menunggu'}`}>{r.status}</span>
                                </div>
                                
                                <p style={{margin: '10px 0 15px 0', fontSize:'14px', whiteSpace:'pre-wrap', color:'#1e293b', background:'#f8fafc', padding:'12px', borderRadius:'10px', border:'1px solid #f1f5f9'}}>
                                  {parsed.description || "-"}
                                </p>
                                
                                {parsed.revisionNote && (
                                  <div style={{marginTop:'10px', marginBottom:'15px', background:'#fffbeb', padding:'10px', borderRadius:'12px', border:'1px solid #fed7aa'}}>
                                    <b style={{fontSize:'11px', display:'block', marginBottom:'3px', color:'#b45309', fontWeight:'700'}}>💬 Catatan Masukan Revisi:</b>
                                    <span style={{fontSize:'12px', color:'#78350f', fontStyle:'italic'}}>{parsed.revisionNote}</span>
                                  </div>
                                )}
                                
                                {parsed.attachment && (
                                  <div style={{marginTop:'10px', marginBottom:'15px', background:'#f8fafc', padding:'10px', borderRadius:'12px', border:'1px dashed #cbd5e1'}}>
                                    <b style={{fontSize:'11px', display:'block', marginBottom:'5px', color:'#475569', fontWeight:'700'}}>📎 Lampiran Dokumen / Bukti:</b>
                                    {parsed.attachment.startsWith('data:image/') ? (
                                      <img 
                                        src={parsed.attachment} 
                                        style={{maxHeight:'150px', borderRadius:'8px', border:'1px solid #cbd5e1', cursor:'pointer', display:'block', margin:'0 auto'}} 
                                        onClick={() => {
                                          const w = window.open();
                                          w.document.write(`<img src="${parsed.attachment}" style="max-width:100%; max-height:100vh; display:block; margin:auto; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,0.15);" />`);
                                        }}
                                        title="Klik untuk memperbesar gambar"
                                        alt="Bukti Lampiran"
                                      />
                                    ) : (
                                      <a href={parsed.attachment} download={`lampiran-${r.staff_name}`} className="btn soft small full" style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'6px', padding:'8px'}}>
                                        📄 Unduh Dokumen Pendukung
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>

                              {r.status==='Menunggu' && (
                                <div className="btn-row" style={{marginTop:'12px', gap:'8px'}}>
                                  <button className="btn success" style={{flex:1}} onClick={()=>updateRequestStatus(r.id,'Disetujui')}>Setujui</button>
                                  <button className="btn warning" style={{flex:1}} onClick={()=>{
                                    setShowRevisionModal(r);
                                    setRevisionInput('');
                                  }}>Revisi</button>
                                  <button className="btn danger" style={{flex:1}} onClick={()=>updateRequestStatus(r.id,'Ditolak')}>Tolak</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
                              <div className="card kpi-card" style={{cursor:'pointer', transition:'0.2s', transform:'translateY(0)'}} onClick={() => setShowStaffOvertimeModal(true)} onMouseOver={e=>e.currentTarget.style.transform='translateY(-5px)'} onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}><div className="kpi-icon"><AlertCircle /></div><div className="kpi-value">{durationLabel(calc.overtimeMins)}</div><div className="kpi-label" style={{color:'#3b82f6', fontWeight:'600'}}>Detail Lembur</div></div>
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
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                          <h3>Absensi Online</h3>
                          <small className="muted">{new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'})}</small>
                        </div>
                        <div className="form-stack" style={{marginTop:'15px'}}>
                          <div className="field">
                            <label>Tipe Kehadiran (Project)</label>
                            <div className="btn-row">
                               {['WFO (Head Office)', 'On-Project', 'Client Visit'].map(p => (
                                  <button key={p} className={`btn ${attendanceForm.project === p ? 'primary' : 'soft'} small`} onClick={() => setAttendanceForm({...attendanceForm, project: p})}>{p}</button>
                               ))}
                            </div>
                          </div>
                          <div className="grid two">
                            <div className="field">
                              <label>Masuk</label>
                              <div style={{display:'flex', gap:'8px'}}>
                                <input type="time" value={attendanceForm.checkIn} onChange={e=>setAttendanceForm({...attendanceForm, checkIn:e.target.value})} style={{flex:1}}/>
                                <button className="btn soft" onClick={() => setAttendanceForm({...attendanceForm, checkIn: nowTime()})} title="Waktu Saat Ini"><Clock size={16}/></button>
                              </div>
                            </div>
                            <div className="field">
                              <label>Pulang</label>
                              <div style={{display:'flex', gap:'8px'}}>
                                <input type="time" value={attendanceForm.checkOut} onChange={e=>setAttendanceForm({...attendanceForm, checkOut:e.target.value})} style={{flex:1}}/>
                                <button className="btn soft" onClick={() => setAttendanceForm({...attendanceForm, checkOut: nowTime()})} title="Waktu Saat Ini"><Clock size={16}/></button>
                              </div>
                            </div>
                          </div>
                          <div className="field"><label>Catatan Khusus (Opsional)</label><textarea placeholder="Tambahkan keterangan jika perlu..." value={attendanceForm.note} onChange={e=>setAttendanceForm({...attendanceForm, note:e.target.value})}/></div>
                          <div className="btn-row" style={{marginTop:'10px'}}><button className="btn primary" onClick={()=>saveAttendance('in')}>🚀 Absen Masuk</button><button className="btn warning" onClick={()=>saveAttendance('out')}>👋 Absen Pulang</button></div>
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
                      <div className="card">
                        <h3>{editingRequest ? '✏️ Revisi Pengajuan' : 'Kirim Pengajuan'}</h3>
                        {editingRequest && (() => {
                          const parsed = parseReason(editingRequest.reason);
                          return (
                            <div style={{background:'#fee2e2', borderLeft:'4px solid #ef4444', padding:'12px 15px', borderRadius:'10px', fontSize:'13px', color:'#991b1b', marginBottom:'15px', lineHeight:'1.5'}}>
                              <b style={{display:'flex', alignItems:'center', gap:'6px'}}><AlertCircle size={14} /> Catatan Revisi Admin:</b>
                              <p style={{margin:'5px 0 0 0', fontStyle:'italic'}}>{parsed.revisionNote || 'Mohon diperbaiki sesuai instruksi admin.'}</p>
                            </div>
                          );
                        })()}
                        <div className="form-stack">
                          <div className="field">
                            <label>Tipe Pengajuan</label>
                            <select 
                              value={requestForm.type} 
                              onChange={e => {
                                const newType = e.target.value;
                                setRequestForm({ ...requestForm, type: newType });
                                if (newType !== 'Lainnya') {
                                  setRequestTitle('');
                                }
                              }}
                            >
                              <option value="Cuti">Cuti</option>
                              <option value="Izin">Izin</option>
                              <option value="Sakit">Sakit</option>
                              <option value="Lainnya">Lainnya (e.g. Reimbursement, Dinas, dll.)</option>
                            </select>
                          </div>
                          
                          {requestForm.type === 'Lainnya' && (
                            <div className="field animate-in">
                              <label>Judul Pengajuan</label>
                              <input 
                                type="text" 
                                placeholder="Contoh: Reimburse Bensin Survey Cilegon" 
                                value={requestTitle} 
                                onChange={e => setRequestTitle(e.target.value)} 
                              />
                            </div>
                          )}

                          <div className="field">
                            <label>Tanggal</label>
                            <input 
                              type="date" 
                              value={requestForm.date} 
                              onChange={e => setRequestForm({ ...requestForm, date: e.target.value })} 
                            />
                          </div>

                          <div className="field">
                            <label>{requestForm.type === 'Lainnya' ? 'Deskripsi Detail' : 'Alasan / Keterangan'}</label>
                            <textarea 
                              placeholder={requestForm.type === 'Lainnya' ? 'Tuliskan deskripsi lengkap, rincian biaya, atau keperluan lainnya...' : 'Tuliskan alasan pengajuan Anda secara ringkas...'} 
                              value={requestForm.reason} 
                              onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })} 
                            />
                          </div>

                          <div className="field">
                            <label>Unggah Bukti / Lampiran (Opsional)</label>
                            <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                              <button 
                                className="btn soft" 
                                style={{flex: 1, padding:'10px', display:'flex', justifyContent:'center', alignItems:'center', gap:'8px'}} 
                                onClick={() => requestFileRef.current.click()}
                              >
                                <Upload size={16} /> 
                                {requestAttachment ? 'Ganti Lampiran' : 'Pilih File / Foto Bukti'}
                              </button>
                              {requestAttachment && (
                                <button 
                                  className="btn danger ghost small" 
                                  onClick={() => setRequestAttachment('')} 
                                  title="Hapus Lampiran"
                                  style={{padding:'10px'}}
                                >
                                  <X size={16} />
                                </button>
                              )}
                            </div>
                            <input 
                              type="file" 
                              accept="image/*,application/pdf" 
                              style={{display:'none'}} 
                              ref={requestFileRef} 
                              onChange={handleRequestFileChange} 
                            />
                            {requestAttachment && (
                              <div style={{marginTop:'12px', border:'1px dashed #e2e8f0', borderRadius:'14px', padding:'12px', background:'#f8fafc'}}>
                                {requestAttachment.startsWith('data:image/') ? (
                                  <img 
                                    src={requestAttachment} 
                                    style={{maxHeight:'120px', borderRadius:'8px', display:'block', margin:'0 auto', border:'1px solid #cbd5e1'}} 
                                    alt="Preview" 
                                  />
                                ) : (
                                  <div style={{textAlign:'center', fontSize:'12px', color:'#475569', fontWeight:'600'}}>
                                    📄 Dokumen Terpilih
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="btn-row" style={{marginTop:'12px', gap:'10px'}}>
                            {editingRequest && (
                              <button 
                                className="btn ghost" 
                                style={{flex: 1}}
                                onClick={() => {
                                  setEditingRequest(null);
                                  setRequestForm({ type: 'Cuti', date: todayKey(), reason: '' });
                                  setRequestTitle('');
                                  setRequestAttachment('');
                                }}
                              >
                                ❌ Batal
                              </button>
                            )}
                            <button 
                              className="btn primary" 
                              style={{flex: 2}}
                              onClick={async () => {
                                if (requestForm.type === 'Lainnya' && !requestTitle) {
                                  return showToast("Judul pengajuan wajib diisi!");
                                }
                                if (!requestForm.reason) {
                                  return showToast("Keterangan wajib diisi!");
                                }

                                const originalParsed = editingRequest ? parseReason(editingRequest.reason) : {};
                                const finalReason = JSON.stringify({
                                  title: requestForm.type === 'Lainnya' ? requestTitle : '',
                                  description: requestForm.reason,
                                  attachment: requestAttachment || '',
                                  revisionNote: originalParsed.revisionNote || '',
                                  isRevised: !!editingRequest
                                });

                                const payload = {
                                  staff_id: currentUser.id,
                                  staff_name: currentUser.name,
                                  type: requestForm.type,
                                  date: requestForm.date,
                                  reason: finalReason,
                                  status: 'Menunggu'
                                };

                                let error;
                                if (editingRequest) {
                                  const { error: err } = await supabase.from('requests').update(payload).eq('id', editingRequest.id);
                                  error = err;
                                } else {
                                  const { error: err } = await supabase.from('requests').insert([payload]);
                                  error = err;
                                }

                                if (error) {
                                  showToast(editingRequest ? "Gagal memperbarui pengajuan." : "Gagal mengirim pengajuan.");
                                } else {
                                  showToast(editingRequest ? "Pengajuan berhasil direvisi!" : "Pengajuan berhasil dikirim!");
                                  setEditingRequest(null);
                                  setRequestForm({ type: 'Cuti', date: todayKey(), reason: '' });
                                  setRequestTitle('');
                                  setRequestAttachment('');
                                  fetchData();
                                }
                              }}
                            >
                              {editingRequest ? '💾 Simpan Revisi Pengajuan' : '🚀 Kirim Pengajuan'}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="card">
                        <h3>Riwayat Pengajuan</h3>
                        <div className="request-list">
                          {requests.filter(r => r.staff_id === currentUser.id).map(r => (
                            <div key={r.id} className="request-card">
                              <div className="request-info">
                                <b>{r.type}</b>
                                <small>{fmtDate(r.date)}</small>
                              </div>
                              <div className="request-actions" style={{display:'flex', alignItems:'center', gap:'6px'}}>
                                <span className={`status-pill ${r.status==='Disetujui'?'hadir':r.status==='Ditolak'?'merah':r.status==='Revisi'?'telat':'menunggu'}`}>{r.status}</span>
                                {r.status === 'Revisi' && (
                                  <button 
                                    className="btn soft small" 
                                    onClick={() => {
                                      setEditingRequest(r);
                                      const parsed = parseReason(r.reason);
                                      setRequestForm({ type: r.type, date: r.date, reason: parsed.description });
                                      if (r.type === 'Lainnya') {
                                        setRequestTitle(parsed.title);
                                      }
                                      setRequestAttachment(parsed.attachment || '');
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                      showToast("Formulir revisi siap diisi!");
                                    }}
                                    style={{padding:'4px 10px', fontSize:'11px', fontWeight:'700', borderRadius:'20px', background:'#fef9c3', color:'#a16207', border:'1px solid #fef08a'}}
                                    title="Klik untuk merevisi pengajuan ini"
                                  >
                                    ✏️ Revisi
                                  </button>
                                )}
                                <button className="btn ghost small" onClick={() => setSelectedRequest(r)}><Info size={14}/></button>
                              </div>
                            </div>
                          ))}
                          {requests.filter(r => r.staff_id === currentUser.id).length === 0 && <div className="muted">Belum ada pengajuan.</div>}
                        </div>
                      </div>
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
      </div>

      {/* Modals moved OUTSIDE app-shell to prevent transform issues */}
      {showStaffOvertimeModal && (() => {
        const d = new Date();
        const currentMonthPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const myMonthRecords = records.filter(r => r.staff_id === currentUser.id && r.date.startsWith(currentMonthPrefix) && calcRecord(r).overtimeMins > 0).sort((a,b) => new Date(b.date) - new Date(a.date));
        let totalOvertimeMins = 0;
        myMonthRecords.forEach(r => totalOvertimeMins += calcRecord(r).overtimeMins);
        
        const totalOvertimeHours = Math.floor(totalOvertimeMins / 60);
        const validBonusHours = Math.min(totalOvertimeHours, 5);
        const bonusAmount = validBonusHours * 50000;
        
        return (
          <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'800px'}}>
            <div className="modal-head"><h3>Detail Lembur Bulan Ini</h3><button className="btn ghost small" onClick={()=>setShowStaffOvertimeModal(false)}><X size={18}/></button></div>
            <div className="modal-body">
              <div className="grid two" style={{marginBottom:'20px'}}>
                <div className="card" style={{background:'#f8faff', border:'1px solid #e2e8f0', display:'flex', flexDirection:'column', justifyContent:'center'}}>
                  <div style={{color:'#64748b', fontSize:'13px', fontWeight:'600', marginBottom:'4px'}}>Total Waktu Lembur</div>
                  <div style={{fontSize:'28px', fontWeight:'800', color:'#0f172a'}}>{durationLabel(totalOvertimeMins)}</div>
                  <div style={{color:'#8b5cf6', fontSize:'12px', marginTop:'4px', fontWeight:'500'}}>Batas Maksimal Bonus: 5 Jam</div>
                </div>
                <div className="card" style={{background:'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color:'white', display:'flex', flexDirection:'column', justifyContent:'center', border:'none'}}>
                  <div style={{color:'rgba(255,255,255,0.8)', fontSize:'13px', fontWeight:'600', marginBottom:'4px'}}>Estimasi Bonus Lembur</div>
                  <div style={{fontSize:'28px', fontWeight:'800'}}>Rp {bonusAmount.toLocaleString('id-ID')}</div>
                  <div style={{color:'rgba(255,255,255,0.9)', fontSize:'12px', marginTop:'4px', fontWeight:'500'}}>Berdasarkan {validBonusHours} jam (Rp 50.000/jam)</div>
                </div>
              </div>
              <h4 style={{marginBottom:'15px', color:'#334155'}}>Riwayat Lembur Bulan Ini</h4>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Tanggal</th><th>Jam Masuk</th><th>Jam Pulang</th><th>Durasi Lembur</th></tr></thead>
                  <tbody>
                    {myMonthRecords.length === 0 ? (
                      <tr><td colSpan="4" style={{textAlign:'center', padding:'30px', color:'#94a3b8'}}>Tidak ada data lembur bulan ini.</td></tr>
                    ) : (
                      myMonthRecords.map(r => {
                        const m = calcRecord(r).overtimeMins;
                        return (
                          <tr key={r.id}>
                            <td><b>{fmtDate(r.date)}</b></td>
                            <td>{r.check_in}</td>
                            <td>{r.check_out}</td>
                            <td><span style={{color:'#8b5cf6', fontWeight:'600', background:'#f3e8ff', padding:'4px 8px', borderRadius:'6px', fontSize:'12px'}}>{durationLabel(m)}</span></td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div></div>
        );
      })()}
      {showManualModal && (
        <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'900px'}}>
          <div className="modal-head"><h3>Tambah Absen Manual</h3><button className="btn ghost small" onClick={()=>setShowManualModal(false)}><X size={18}/></button></div>
          <div className="modal-body"><div className="grid two"><div className="form-stack">
            <div className="field"><label>Pilih Karyawan</label><select value={manualForm.staffId} onChange={e=>setManualForm({...manualForm, staffId:e.target.value})}><option value="">-- Pilih --</option>{staffList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div className="field"><label>Tanggal</label><input type="date" value={manualForm.date} onChange={e=>setManualForm({...manualForm, date:e.target.value})}/></div>
            <div className="grid two"><div className="field"><label>Masuk</label><input type="time" value={manualForm.checkIn} onChange={e=>setManualForm({...manualForm, checkIn:e.target.value})}/></div><div className="field"><label>Pulang</label><input type="time" value={manualForm.checkOut} onChange={e=>setManualForm({...manualForm, checkOut:e.target.value})}/></div></div>
            <div className="card" style={{background:'#f8faff'}}><div className="location-preview">{detecting?'Mencari...':(manualLocation?manualLocation.address:'Belum ada')}</div><button className="btn soft full" onClick={()=>detectLocation('manual')}><Navigation size={16}/> Deteksi</button></div>
            <button className="btn primary full" onClick={handleManualSubmit}>Simpan Absen</button>
          </div><div className="card"><h3>Foto</h3><div className="photo-box">{manualPhoto?<img src={manualPhoto}/>:<div className="photo-placeholder">No Photo</div>}</div><div className="btn-row" style={{marginTop:'12px'}}><button className="btn soft" style={{flex:1}} onClick={()=>manualCamRef.current.click()}><Camera size={16}/> Kamera</button><button className="btn ghost" style={{flex:1}} onClick={()=>manualGalRef.current.click()}><Image size={16}/> Galeri</button></div><input type="file" capture="environment" style={{display:'none'}} ref={manualCamRef} onChange={e=>handleFileChange(e,'manual')}/><input type="file" style={{display:'none'}} ref={manualGalRef} onChange={e=>handleFileChange(e,'manual')}/></div></div></div>
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
        <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'700px'}}>
          <div className="modal-head"><h3>Profil {selectedStaff.name}</h3><button className="btn ghost small" onClick={()=>setSelectedStaff(null)}><X size={18}/></button></div>
          <div className="modal-body">
            <div className="user-chip" style={{background:'#f8faff', padding:'20px', borderRadius:'22px'}}><div className="avatar">{initials(selectedStaff.name)}</div><div><b>{selectedStaff.name}</b><br/><small>{selectedStaff.id} • {selectedStaff.division}</small></div></div>
            <h4 style={{marginTop:'25px', marginBottom:'15px'}}>Rekap Kehadiran (Periode Ini)</h4>
            <div className="grid two" style={{gap:'12px'}}>
              {(() => { 
                const s = getStaffStats(selectedStaff.id); 
                return (
                  <>
                    <div className="card" style={{display:'flex', alignItems:'center', gap:'12px', padding:'15px', background:'#f0f7ff'}}>
                      <div style={{background:'var(--brand)', color:'white', padding:'10px', borderRadius:'12px'}}><Calendar size={20}/></div>
                      <div><b>{s.present}</b><br/><small>Hadir</small></div>
                    </div>
                    <div className="card" style={{display:'flex', alignItems:'center', gap:'12px', padding:'15px', background:'#fff9f0'}}>
                      <div style={{background:'var(--warning)', color:'white', padding:'10px', borderRadius:'12px'}}><Clock size={20}/></div>
                      <div><b>{s.overtime}</b><br/><small>Lembur</small></div>
                    </div>
                    <div className="card" style={{display:'flex', alignItems:'center', gap:'12px', padding:'15px', background:'#f0fff4'}}>
                      <div style={{background:'#22c55e', color:'white', padding:'10px', borderRadius:'12px'}}><CheckCircle size={20}/></div>
                      <div><b>{s.izin}</b><br/><small>Izin</small></div>
                    </div>
                    <div className="card" style={{display:'flex', alignItems:'center', gap:'12px', padding:'15px', background:'#fff5f5'}}>
                      <div style={{background:'#ef4444', color:'white', padding:'10px', borderRadius:'12px'}}><Heart size={20}/></div>
                      <div><b>{s.sakit}</b><br/><small>Sakit</small></div>
                    </div>
                    <div className="card" style={{display:'flex', alignItems:'center', gap:'12px', padding:'15px', background:'#f3f0ff'}}>
                      <div style={{background:'#8b5cf6', color:'white', padding:'10px', borderRadius:'12px'}}><MessageSquare size={20}/></div>
                      <div><b>{s.cuti}</b><br/><small>Cuti</small></div>
                    </div>
                  </>
                ); 
              })()}
            </div>
            <button className="btn primary full" style={{marginTop:'25px'}} onClick={()=>setSelectedStaff(null)}>Tutup Profil</button>
          </div>
        </div></div>
      )}
      {selectedRequest && (() => {
        const parsed = parseReason(selectedRequest.reason);
        return (
          <div className="modal-backdrop" onClick={()=>setSelectedRequest(null)}>
            <div className="modal animate-in" onClick={e=>e.stopPropagation()} style={{maxWidth:'500px'}}>
              <div className="modal-head">
                <h3>Detail Pengajuan</h3>
                <button className="btn ghost small" onClick={()=>setSelectedRequest(null)}><X size={18}/></button>
              </div>
              <div className="modal-body">
                <div style={{marginBottom:'20px', display:'flex', gap:'8px', alignItems:'center'}}>
                  <span className={`status-pill ${selectedRequest.status==='Disetujui'?'hadir':selectedRequest.status==='Ditolak'?'merah':selectedRequest.status==='Revisi'?'telat':'menunggu'}`}>{selectedRequest.status}</span>
                  {parsed.isRevised && (
                    <span className="status-pill hadir" style={{fontSize:'11px', padding:'3px 8px', fontWeight:'700'}}>✨ Telah Direvisi</span>
                  )}
                </div>
                {selectedRequest.status === 'Revisi' && parsed.revisionNote && (
                  <div style={{background:'#fffbeb', borderLeft:'4px solid #d97706', padding:'12px', borderRadius:'8px', fontSize:'13px', color:'#92400e', marginBottom:'15px', lineHeight:'1.4'}}>
                    <b>💬 Catatan Revisi Admin:</b>
                    <p style={{margin:'4px 0 0 0', fontStyle:'italic'}}>{parsed.revisionNote}</p>
                  </div>
                )}
                <div className="form-stack">
                  <div className="field">
                    <label>Jenis Pengajuan</label>
                    <div className="card" style={{background:'#f8faff', borderRadius:'14px'}}>
                      <b>{selectedRequest.type === 'Lainnya' ? `Lainnya: ${parsed.title || 'Tanpa Judul'}` : selectedRequest.type}</b>
                    </div>
                  </div>
                  <div className="field"><label>Tanggal Pelaksanaan</label><div className="card" style={{background:'#f8faff', borderRadius:'14px'}}><b>{fmtDate(selectedRequest.date)}</b></div></div>
                  
                  <div className="field">
                    <label>{selectedRequest.type === 'Lainnya' ? 'Deskripsi Detail' : 'Alasan / Keterangan'}</label>
                    <div className="card" style={{background:'#f8faff', minHeight:'100px', whiteSpace:'pre-wrap', borderRadius:'14px', lineHeight:'1.5', padding:'15px'}}>{parsed.description || "-"}</div>
                  </div>
                  
                  {parsed.attachment && (
                    <div className="field">
                      <label>Lampiran / Dokumen Pendukung</label>
                      <div className="card" style={{background:'#f8faff', display:'flex', flexDirection:'column', alignItems:'center', padding:'15px', borderRadius:'14px', border:'1px dashed #cbd5e1'}}>
                        {parsed.attachment.startsWith('data:image/') ? (
                          <img 
                            src={parsed.attachment} 
                            style={{maxHeight:'200px', borderRadius:'10px', border:'1px solid #cbd5e1', cursor:'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.06)'}} 
                            onClick={() => {
                              const w = window.open();
                              w.document.write(`<img src="${parsed.attachment}" style="max-width:100%; max-height:100vh; display:block; margin:auto; border-radius:10px;" />`);
                            }}
                            title="Klik untuk memperbesar gambar"
                            alt="Bukti Lampiran"
                          />
                        ) : (
                          <a href={parsed.attachment} download={`lampiran-${selectedRequest.staff_name || 'pengajuan'}`} className="btn soft full" style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'8px', padding:'12px', fontSize:'14px'}}>
                            📄 Unduh Dokumen Pendukung
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button className="btn primary full" style={{marginTop:'25px'}} onClick={()=>setSelectedRequest(null)}>Tutup Detail</button>
              </div>
            </div>
          </div>
        );
      })()}
      {detailList && (
        <div className="modal-backdrop"><div className="modal animate-in" style={{maxWidth:'450px'}}>
          <div className="modal-head"><h3>{detailList.title}</h3><button className="btn ghost small" onClick={()=>setDetailList(null)}><X size={18}/></button></div>
          <div className="modal-body" style={{maxHeight:'400px', overflowY:'auto', padding:'10px 20px'}}>
            {detailList.data.length === 0 ? (
              <div className="muted" style={{padding:'30px', textAlign:'center'}}>Tidak ada data yang ditemukan.</div>
            ) : (
              <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                {detailList.data.map((item, i) => (
                  <div key={i} className="card" style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 15px', border:'1px solid #f0f0f0', background:'white', borderRadius:'12px'}}>
                    <div>
                      <b style={{fontSize:'14px'}}>{item.name}</b>
                      <div style={{fontSize:'12px', color:'#64748b', marginTop:'2px'}}>{item.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button className="btn soft full" style={{marginTop:'20px'}} onClick={()=>setDetailList(null)}>Tutup</button>
          </div>
        </div></div>
      )}
      {showMonthlyReport && (
        <div className="modal-backdrop" onClick={() => setShowMonthlyReport(false)}>
          <div className="modal animate-in" onClick={e => e.stopPropagation()} style={{maxWidth: '850px', width: '95%', padding:'25px'}}>
            <div className="modal-head" style={{borderBottom:'1px solid #e2e8f0', paddingBottom:'15px', marginBottom:'20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'15px'}}>
              <div style={{display:'flex', alignItems:'center', gap:'15px', flexWrap:'wrap'}}>
                <h3 style={{margin:0}}>Laporan Rekap Bulanan</h3>
                <select 
                  value={reportMonth} 
                  onChange={e => setReportMonth(e.target.value)}
                  style={{padding:'6px 12px', borderRadius:'8px', border:'1px solid #cbd5e1', outline:'none', fontWeight:'600', color:'var(--brand)', background:'#fff'}}
                >
                  <option value="2026-05">Mei 2026</option>
                  <option value="2026-06">Juni 2026</option>
                </select>
              </div>
              <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                <button 
                  onClick={handleDownloadExcel} 
                  style={{background:'linear-gradient(135deg, #10b981 0%, #059669 100%)', color:'white', border:'none', padding:'8px 16px', borderRadius:'10px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600', boxShadow:'0 4px 12px rgba(16, 185, 129, 0.2)', transition:'0.2s'}}
                  onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} 
                  onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}
                >
                  <Download size={16}/> Excel
                </button>
                <button 
                  onClick={handleDownloadPDF} 
                  style={{background:'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)', color:'white', border:'none', padding:'8px 16px', borderRadius:'10px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', fontWeight:'600', boxShadow:'0 4px 12px rgba(225, 29, 72, 0.2)', transition:'0.2s'}}
                  onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'} 
                  onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}
                >
                  <Download size={16}/> PDF
                </button>
                <button className="btn ghost small" onClick={() => setShowMonthlyReport(false)} style={{marginLeft:'10px'}}><X size={18}/></button>
              </div>
            </div>
            
            <div ref={pdfChartRef} style={{background:'#f8fafc', padding:'20px', borderRadius:'14px', border:'1px solid #e2e8f0', marginBottom:'20px', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'20px', alignItems:'center'}}>
              <div>
                <div style={{color:'#64748b', fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px'}}>Bulan Aktif</div>
                <div style={{color:'var(--brand)', fontWeight:'800', fontSize:'26px', lineHeight:'1'}}>{reportMonth === '2026-05' ? 'Mei 2026' : (reportMonth === '2026-06' ? 'Juni 2026' : reportMonth)}</div>
              </div>
              <div style={{borderLeft:'2px solid #e2e8f0', paddingLeft:'20px'}}>
                <div style={{color:'#64748b', fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px'}}>Hari Kerja Efektif</div>
                <div style={{color:'#1e40af', fontWeight:'800', fontSize:'26px', lineHeight:'1'}}>{displayWorkingDays} Hari <span style={{fontSize:'13px', color:'#94a3b8', fontWeight:'600'}}>(Berdasarkan Riwayat)</span></div>
              </div>
              <div style={{borderLeft:'2px solid #e2e8f0', paddingLeft:'20px'}}>
                <div style={{color:'#64748b', fontSize:'12px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'1px', marginBottom:'6px'}}>Total Staf Aktif</div>
                <div style={{color:'#0f172a', fontWeight:'800', fontSize:'26px', lineHeight:'1'}}>{displayActiveStaff} <span style={{fontSize:'13px', color:'#94a3b8', fontWeight:'600'}}>Orang</span></div>
              </div>
            </div>

            <div style={{marginBottom:'15px'}}>
              <input 
                type="text" 
                placeholder="Cari karyawan berdasarkan nama..." 
                value={reportSearch} 
                onChange={e => setReportSearch(e.target.value)} 
                style={{width:'100%', padding:'10px 16px', borderRadius:'12px', border:'1px solid #cbd5e1', outline:'none', fontSize:'14px', transition:'0.2s'}}
              />
            </div>
            
            <div style={{maxHeight:'350px', overflowY:'auto', border:'1px solid #e2e8f0', borderRadius:'14px', background:'#fff'}}>
              <table style={{width:'100%', borderCollapse:'collapse', fontSize:'13px', textAlign:'left'}}>
                <thead>
                  <tr style={{background:'#f1f5f9', borderBottom:'2px solid #cbd5e1', color:'#475569', fontWeight:'700'}}>
                    <th style={{padding:'12px 16px'}}>Nama Karyawan</th>
                    <th style={{padding:'12px 16px', textAlign:'center'}}>Kehadiran</th>
                    <th style={{padding:'12px 16px', textAlign:'center'}}>Hari Kerja</th>
                    <th style={{padding:'12px 16px', textAlign:'center'}}>Persentase</th>
                    <th style={{padding:'12px 16px', textAlign:'right'}}>Total Lembur</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const filtered = staffList.filter(s => s.name.toLowerCase().includes(reportSearch.toLowerCase()));
                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan="5" style={{padding:'30px', textAlign:'center', color:'#64748b'}}>Karyawan tidak ditemukan.</td>
                        </tr>
                      );
                    }
                    return filtered.map((s, idx) => {
                      const staffRecords = records.filter(r => r.staff_id === s.id && r.date.startsWith(reportMonth));
                      const hadirCount = staffRecords.filter(r => {
                        const stat = calcRecord(r).status;
                        return ['Hadir', 'Lembur', 'Telat', 'Hadir (1/2 Hari)'].includes(stat) || stat.toLowerCase().includes('izin');
                      }).length;
                      const workingDays = displayWorkingDays;
                      const percentage = workingDays > 0 ? ((hadirCount / workingDays) * 100).toFixed(0) : 0;
                      
                      const totalOvertimeMins = staffRecords.reduce((acc, r) => acc + calcRecord(r).overtimeMins, 0);
                      const overtimeCount = staffRecords.filter(r => calcRecord(r).overtimeMins > 0).length;
                      
                      return (
                        <tr key={s.id} style={{borderBottom:'1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc'}}>
                          <td style={{padding:'12px 16px', fontWeight:'600', color:'#1e293b'}}>{s.name}</td>
                          <td style={{padding:'12px 16px', textAlign:'center', color:'#1e40af', fontWeight:'600'}}>{hadirCount} Hari</td>
                          <td style={{padding:'12px 16px', textAlign:'center', color:'#475569'}}>{workingDays} Hari</td>
                          <td style={{padding:'12px 16px', textAlign:'center'}}>
                            <span style={{
                              padding:'4px 10px', 
                              borderRadius:'20px', 
                              fontSize:'11px', 
                              fontWeight:'700',
                              background: percentage >= 80 ? '#dcfce7' : percentage >= 50 ? '#fef9c3' : '#fee2e2',
                              color: percentage >= 80 ? '#15803d' : percentage >= 50 ? '#a16207' : '#b91c1c'
                            }}>
                              {percentage}%
                            </span>
                          </td>
                          <td style={{padding:'12px 16px', textAlign:'right', fontWeight:'600', color: overtimeCount > 0 ? '#15803d' : '#64748b'}}>
                            {overtimeCount > 0 ? `${overtimeCount}x (${durationLabel(totalOvertimeMins)})` : '-'}
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
            
            <div style={{marginTop:'20px', display:'flex', justifyContent:'flex-end'}}>
              <button className="btn soft" onClick={() => setShowMonthlyReport(false)} style={{padding:'8px 20px'}}>Tutup Laporan</button>
            </div>
          </div>
        </div>
      )}
      {showRevisionModal && (
        <div className="modal-backdrop" onClick={()=>setShowRevisionModal(null)}>
          <div className="modal animate-in" onClick={e=>e.stopPropagation()} style={{maxWidth:'500px'}}>
            <div className="modal-head">
              <h3>Minta Revisi Pengajuan</h3>
              <button className="btn ghost small" onClick={()=>setShowRevisionModal(null)}><X size={18}/></button>
            </div>
            <div className="modal-body">
              <div style={{background:'#fff9f0', borderLeft:'4px solid #f59e0b', padding:'12px', borderRadius:'10px', fontSize:'13px', color:'#78350f', marginBottom:'20px', lineHeight:'1.5'}}>
                Anda meminta <b>{showRevisionModal.staff_name}</b> untuk merevisi pengajuannya (<b>{showRevisionModal.type}</b>). Tuliskan catatan feedback spesifik di bawah ini.
              </div>
              <div className="field" style={{marginBottom:'20px'}}>
                <label style={{fontWeight:'700', fontSize:'13px', color:'#475569', display:'block', marginBottom:'8px'}}>Catatan Feedback Revisi (Wajib)</label>
                <textarea 
                  placeholder="Contoh: Mohon lampirkan foto struk pembayaran bensin yang lebih jelas dan terbaca..." 
                  value={revisionInput}
                  onChange={e=>setRevisionInput(e.target.value)}
                  style={{minHeight:'100px', width:'100%', padding:'12px', border:'1px solid #cbd5e1', borderRadius:'12px', outline:'none', fontSize:'14px', lineHeight:'1.5'}}
                />
              </div>
              <div className="btn-row" style={{display:'flex', gap:'10px'}}>
                <button className="btn ghost" style={{flex:1}} onClick={()=>setShowRevisionModal(null)}>Batal</button>
                <button 
                  className="btn warning" 
                  style={{flex:2, background:'#f59e0b', color:'white', border:'none', borderRadius:'10px', padding:'10px 16px', fontWeight:'700', cursor:'pointer'}} 
                  onClick={async () => {
                    if (!revisionInput.trim()) {
                      return showToast("Tuliskan catatan revisi terlebih dahulu!");
                    }
                    await updateRequestStatus(showRevisionModal.id, 'Revisi', revisionInput);
                    setShowRevisionModal(null);
                    setRevisionInput('');
                  }}
                >
                  🚀 Kirim Permintaan Revisi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {toast.show && <div className="toast show animate-in" style={{zIndex: 2000}}>{toast.message}</div>}
    </>
  );
}

export default App;
