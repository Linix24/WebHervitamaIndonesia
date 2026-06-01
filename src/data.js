export const RAW_STAFF_NAMES = [
  "Ahmad Kosasih Surahman",
  "Aji Setiawan",
  "Akhmad Nashoikhuddin",
  "Aldilah Desel",
  "Alfian Daris Pratama",
  "Alfidin Rachmansyah",
  "Andi Ernawan",
  "Andre Bagas Pradana",
  "Anis Rosyida",
  "Anisya Agustina Lutvianti",
  "Annisa Trias Widoanti",
  "Ari Luki Ambarsari",
  "Arief Gunawan",
  "Arin Windhana",
  "Awan Triyogo",
  "Bagus Subianto",
  "Danny Setiawan",
  "Devi Indah Kurniawati",
  "Dody Bagus Prayogo",
  "Dicky Susilo",
  "Dwi Cahyono Putra",
  "Fachry Azharuddin Noor",
  "Fabian Bagaskara Sugiharto",
  "Faishol Anwar",
  "Fifin Andriyani",
  "Haddy Handratno",
  "Handi Suryawinata",
  "Hidayat Soediyatno",
  "Ibnu Hafasi Setyawan",
  "Imam Suharyanto",
  "Imam Cahyanuar Rizal",
  "Irawan",
  "Ivan Hasan Ashari",
  "Joni Prasetyo",
  "Khabib Mundzirul Umam",
  "Laras Aditya Putri",
  "M. Taufiq Nur Fitriyan",
  "Muhammad Safiulloh",
  "Muzamil",
  "Nanik Tri Ratnawati",
  "Ramadhan Kurnia Akbar",
  "Rheza Andhika Ramadhan",
  "Rian Khosy Riswanda",
  "Ryan Franki Risdianto",
  "Rony Wijaya",
  "Safika Nur Izzah",
  "Satija Pantjara",
  "Setio Sunarko",
  "Totok Purwoko",
  "Vilma Wahyu Sholikin",
  "Wawan Setiawan",
  "Widhiworo Tantri"
];

export const DIVISIONS = [
  'Engineering',
  'Sales & Marketing',
  'Calibration',
  'Operations',
  'Finance & HR',
  'Dosen Pembimbing'
];
export const LOCATIONS = ["Kantor Pusat", "Project Site", "Workshop", "Client Site", "Remote/Dinas"];

const hrNames = ['Fifin Andriyani', 'Ibnu Hafasi Setyawan', 'Muzamil', 'Arin Windhana', 'Totok Purwoko', 'Alfian Daris Pratama', 'Irawan', 'Joni Prasetyo', 'Bagus Subianto', 'Muhammad Safiulloh', 'Widhiworo Tantri', 'Ramadhan Kurnia Akbar', 'Rian Khosy Riswanda', 'Anisya Agustina Lutvianti', 'Imam Suharyanto', 'Hidayat Soediyatno', 'Ahmad Kosasih Surahman', 'Ari Luki Ambarsari', 'Safika Nur Izzah', 'Wawan Setiawan', 'Arief Gunawan'];
const salesNames = ['Haddy Handratno', 'Setio Sunarko', 'Danny Setiawan', 'Dwi Cahyono Putra', 'Aldilah Desel', 'Rony Wijaya', 'Dody Bagus Prayogo', 'Imam Cahyanuar Rizal', 'Annisa Trias Widoanti', 'Vilma Wahyu Sholikin', 'Fabian Bagaskara Sugiharto', 'Devi Indah Kurniawati'];

export const STAFF = RAW_STAFF_NAMES.map((name, idx) => {
  const no = String(idx + 1).padStart(3, "0");
  let division = "Engineering";
  if (hrNames.includes(name)) division = "Finance & HR";
  else if (salesNames.includes(name)) division = "Sales & Marketing";

  return {
    no: idx + 1,
    id: "HI-" + no,
    username: "HI-" + no,
    password: "PW-" + no,
    name,
    division,
    workType: idx % 5 === 0 ? "Kantor" : (idx % 3 === 0 ? "Mobile / Campuran" : "Lapangan"),
    defaultLocation: LOCATIONS[idx % LOCATIONS.length]
  };
});

export const ADMIN = { username: "HR-001", password: "HR-2026", name: "Admin Finance & HR", role: "Admin HR" };
