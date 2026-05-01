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

export const DIVISIONS = ["Engineering", "Sales & Marketing", "Calibration", "Operations", "Finance & HR"];
export const LOCATIONS = ["Kantor Pusat", "Project Site", "Workshop", "Client Site", "Remote/Dinas"];

export const STAFF = RAW_STAFF_NAMES.map((name, idx) => {
  const no = String(idx + 1).padStart(3, "0");
  const isHrName = name.toLowerCase().includes("fifin");
  return {
    no: idx + 1,
    id: "HI-" + no,
    username: "HI-" + no,
    password: "PW-" + no,
    name,
    division: isHrName ? "Finance & HR" : DIVISIONS[idx % DIVISIONS.length],
    workType: idx % 5 === 0 ? "Kantor" : (idx % 3 === 0 ? "Mobile / Campuran" : "Lapangan"),
    defaultLocation: LOCATIONS[idx % LOCATIONS.length]
  };
});

export const ADMIN = { username: "HR-001", password: "HR-2026", name: "Admin Finance & HR", role: "Admin HR" };
