const mysql = require('mysql2/promise');

async function updateDb2() {
  console.log("Menghubungkan ke MySQL XAMPP...");
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'garnetamart_db'
    });

    console.log("Mengganti kolom 'icon' menjadi 'image_url'...");
    
    // Mengecek kolom agar tidak error jika sudah diganti
    const [columns] = await connection.query("SHOW COLUMNS FROM products LIKE 'image_url'");
    
    if (columns.length === 0) {
      await connection.query(`
        ALTER TABLE products 
        CHANGE COLUMN icon image_url VARCHAR(255) DEFAULT '📦'
      `);
      console.log("✅ Kolom berhasil diganti menjadi 'image_url'!");
    } else {
      console.log("Kolom 'image_url' sudah ada.");
    }

    await connection.end();
  } catch (error) {
    console.error("❌ ERROR UPDATE DATABASE:", error.message);
  }
}

updateDb2();
