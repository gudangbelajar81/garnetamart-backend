const mysql = require('mysql2/promise');

async function updateDb4() {
  console.log("Menghubungkan ke MySQL XAMPP...");
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'garnetamart_db'
    });

    console.log("Memeriksa kolom 'role' di tabel 'admins'...");
    
    // Mengecek kolom agar tidak error jika sudah ada
    const [columns] = await connection.query("SHOW COLUMNS FROM admins LIKE 'role'");
    
    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE admins 
        ADD COLUMN role VARCHAR(50) DEFAULT 'Manajer'
      `);
      console.log("✅ Kolom 'role' berhasil ditambahkan!");
    } else {
      console.log("Kolom 'role' sudah ada.");
    }

    // Set Budi menjadi Manajer
    await connection.query(`UPDATE admins SET role = 'Manajer' WHERE email = 'budi@garnetamart.com'`);
    console.log("✅ Pangkat 'Manajer' diberikan kepada Budi.");

    // Cek apakah akun kasir sudah ada
    const [kasirRows] = await connection.query("SELECT * FROM admins WHERE email = 'kasir@garnetamart.com'");
    if (kasirRows.length === 0) {
      await connection.query(`
        INSERT INTO admins (name, email, password, role) 
        VALUES ('Siti (Kasir)', 'kasir@garnetamart.com', 'kasir123', 'Kasir')
      `);
      console.log("✅ Akun karyawan 'Siti (Kasir)' berhasil diciptakan!");
    } else {
      console.log("Akun kasir sudah terdaftar.");
    }

    await connection.end();
    console.log("🎉 Operasi Database Selesai!");
  } catch (error) {
    console.error("❌ ERROR UPDATE DATABASE:", error.message);
  }
}

updateDb4();
