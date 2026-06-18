const mysql = require('mysql2/promise');

async function setup() {
  console.log("Menghubungkan ke MySQL XAMPP...");
  try {
    // Konek tanpa nama database dulu untuk membuat databasenya
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: ''
    });

    console.log("Membuat Database garnetamart_db...");
    await connection.query("CREATE DATABASE IF NOT EXISTS garnetamart_db;");
    await connection.query("USE garnetamart_db;");

    console.log("Membuat Tabel products...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INT NOT NULL,
        stock INT NOT NULL,
        icon VARCHAR(50) DEFAULT '📦'
      );
    `);

    console.log("Membuat Tabel orders...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_address TEXT NOT NULL,
        customer_phone VARCHAR(50) NOT NULL,
        total_amount INT NOT NULL,
        order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Membersihkan data produk lama (jika ada)...");
    await connection.query("TRUNCATE TABLE products;");

    console.log("Menyuntikkan data dummy ke tabel products...");
    const dummyProducts = [
      ['Beras Premium 5Kg (Asli DB)', 65000, 24, '🌾'],
      ['Minyak Goreng 2L (Asli DB)', 34000, 15, '🛢️'],
      ['Gula Pasir 1Kg (Asli DB)', 16000, 40, '🧂'],
      ['Kopi Bubuk 250g (Asli DB)', 25000, 12, '☕'],
      ['Sabun Cuci Piring (Asli DB)', 12000, 35, '🧼'],
      ['Mie Instan (Dus) (Asli DB)', 110000, 8, '🍜']
    ];

    await connection.query(
      "INSERT INTO products (name, price, stock, icon) VALUES ?",
      [dummyProducts]
    );

    console.log("✅ SETUP DATABASE SUKSES!");
    await connection.end();

  } catch (error) {
    console.error("❌ ERROR SETUP DATABASE:", error.message);
  }
}

setup();
