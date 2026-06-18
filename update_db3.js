const mysql = require('mysql2/promise');

async function updateDb3() {
  console.log("Menghubungkan ke MySQL XAMPP...");
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'garnetamart_db'
    });

    console.log("Menambahkan kolom 'category' ke tabel 'products'...");
    
    // Mengecek kolom agar tidak error jika sudah ada
    const [columns] = await connection.query("SHOW COLUMNS FROM products LIKE 'category'");
    
    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE products 
        ADD COLUMN category VARCHAR(100) DEFAULT 'Umum'
      `);
      console.log("✅ Kolom 'category' berhasil ditambahkan!");
    } else {
      console.log("Kolom 'category' sudah ada.");
    }

    await connection.end();
  } catch (error) {
    console.error("❌ ERROR UPDATE DATABASE:", error.message);
  }
}

updateDb3();
