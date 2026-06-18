const mysql = require('mysql2/promise');

async function updateDb() {
  console.log("Menghubungkan ke MySQL XAMPP...");
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'garnetamart_db'
    });

    console.log("Menambahkan kolom 'status' ke tabel 'orders'...");
    
    // Mengecek apakah kolom sudah ada agar tidak error jika dijalankan dua kali
    const [columns] = await connection.query("SHOW COLUMNS FROM orders LIKE 'status'");
    
    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN status VARCHAR(50) DEFAULT 'Baru'
      `);
      console.log("✅ Kolom 'status' berhasil ditambahkan!");
    } else {
      console.log("Kolom 'status' sudah ada, melewati proses alter.");
    }

    await connection.end();
  } catch (error) {
    console.error("❌ ERROR UPDATE DATABASE:", error.message);
  }
}

updateDb();
