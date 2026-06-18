const mysql = require('mysql2/promise');

async function setupAdmins() {
  console.log("Menghubungkan ke MySQL XAMPP...");
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'garnetamart_db'
    });

    console.log("Membuat Tabel admins...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) DEFAULT 'Administrator'
      );
    `);

    console.log("Menyuntikkan akun admin bawaan (Default Admin)...");
    // Gunakan INSERT IGNORE agar tidak error jika dijalankan 2x
    await connection.query(`
      INSERT IGNORE INTO admins (email, password, name) 
      VALUES ('admin@garnetamart.com', 'rahasia123', 'Super Admin')
    `);

    console.log("✅ SETUP TABEL ADMIN SUKSES!");
    await connection.end();

  } catch (error) {
    console.error("❌ ERROR SETUP ADMINS:", error.message);
  }
}

setupAdmins();
