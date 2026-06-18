require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Konfigurasi Database
const dbConfig = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'garnetamart_db',
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306
};
console.log("DB Config:", { host: dbConfig.host, user: dbConfig.user, database: dbConfig.database, port: dbConfig.port });

// Pastikan folder uploads ada
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir);
}

// Konfigurasi Multer untuk menyimpan file ke memori sementara sebelum dikompres
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// MIDDLEWARE
app.use(cors({ origin: process.env.FRONTEND_URL || '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());

// Membuka folder uploads agar bisa diakses public (Browser)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- API ENDPOINTS ---

// 1. Ambil daftar produk
app.get('/api/products', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query("SELECT * FROM products");
    await connection.end();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil produk" });
  }
});

// 2. Proses Checkout
app.post('/api/checkout', async (req, res) => {
  const { customer_name, customer_address, customer_phone, total_amount } = req.body;
  if (!customer_name || !customer_address || !total_amount) return res.status(400).json({ success: false, message: "Data tidak lengkap" });

  try {
    const connection = await mysql.createConnection(dbConfig);
    const [result] = await connection.query(
      "INSERT INTO orders (customer_name, customer_address, customer_phone, total_amount) VALUES (?, ?, ?, ?)",
      [customer_name, customer_address, customer_phone, total_amount]
    );
    await connection.end();
    res.json({ success: true, message: "Pesanan masuk", order_id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal menyimpan pesanan" });
  }
});

// 3. Login Admin
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query("SELECT * FROM admins WHERE email = ? AND password = ?", [email, password]);
    await connection.end();

    if (rows.length > 0) res.json({ success: true, message: "Login Berhasil!", token: "DUMMY_TOKEN_123", user: rows[0].name, role: rows[0].role });
    else res.status(401).json({ success: false, message: "Email atau Password salah!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan" });
  }
});

// 4. Daftar Pesanan untuk Dashboard
app.get('/api/orders', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.query("SELECT * FROM orders ORDER BY id DESC");
    await connection.end();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil pesanan" });
  }
});

// 5. Ubah Status Pesanan
app.put('/api/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, message: "Status kosong" });

  try {
    const connection = await mysql.createConnection(dbConfig);
    await connection.query("UPDATE orders SET status=? WHERE id=?", [status, id]);
    await connection.end();
    res.json({ success: true, message: "Status diperbarui" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal update status" });
  }
});

// 6. Tambah Produk (dengan Upload Gambar)
app.post('/api/products', upload.single('image'), async (req, res) => {
  const { name, price, stock, category } = req.body;
  const productCategory = category || 'Umum';
  let image_url = '📦'; // Default fallback

  try {
    if (req.file) {
      const filename = `product-${Date.now()}.webp`;
      const filepath = path.join(uploadDir, filename);
      
      // Proses Kompresi Sharp (Ubah ke WebP, resize max width 500px, kualitas 80%)
      await sharp(req.file.buffer)
        .resize({ width: 500, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);
        
      image_url = `/uploads/${filename}`;
    }

    const connection = await mysql.createConnection(dbConfig);
    const [result] = await connection.query("INSERT INTO products (name, price, stock, category, image_url) VALUES (?, ?, ?, ?, ?)", [name, price, stock, productCategory, image_url]);
    await connection.end();
    res.json({ success: true, message: "Produk berhasil ditambahkan", id: result.insertId, image_url, category: productCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal menambah produk" });
  }
});

// 7. Edit Produk (dengan Update Gambar)
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, price, stock, category, old_image_url } = req.body;
  const productCategory = category || 'Umum';
  let image_url = old_image_url || '📦';

  try {
    // Jika ada file baru yang diupload, proses lagi dengan sharp
    if (req.file) {
      const filename = `product-${Date.now()}.webp`;
      const filepath = path.join(uploadDir, filename);
      
      await sharp(req.file.buffer)
        .resize({ width: 500, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(filepath);
        
      image_url = `/uploads/${filename}`;
    }

    const connection = await mysql.createConnection(dbConfig);
    await connection.query("UPDATE products SET name=?, price=?, stock=?, category=?, image_url=? WHERE id=?", [name, price, stock, productCategory, image_url, id]);
    await connection.end();
    res.json({ success: true, message: "Produk berhasil diubah", image_url, category: productCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengubah produk" });
  }
});

// 8. Hapus Produk
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await mysql.createConnection(dbConfig);
    await connection.query("DELETE FROM products WHERE id=?", [id]);
    await connection.end();
    res.json({ success: true, message: "Produk dihapus" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal menghapus produk" });
  }
});

// Otomatis membuat tabel jika belum ada (berguna untuk Railway)
async function initializeDB() {
  try {
    const connection = await mysql.createConnection(dbConfig);
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) DEFAULT 'Administrator',
        role VARCHAR(50) DEFAULT 'admin'
      );
    `);
    
    await connection.query(`
      INSERT IGNORE INTO admins (email, password, name) 
      VALUES ('admin@garnetamart.com', 'rahasia123', 'Super Admin')
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price INT NOT NULL,
        stock INT DEFAULT 0,
        category VARCHAR(100) DEFAULT 'Umum',
        image_url VARCHAR(255) DEFAULT '📦'
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        customer_address TEXT NOT NULL,
        customer_phone VARCHAR(50),
        total_amount INT NOT NULL,
        status VARCHAR(50) DEFAULT 'Menunggu Konfirmasi',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await connection.end();
    console.log("✅ Database tables ensured!");
  } catch(e) {
    console.error("❌ Database initialization failed:", e.message);
  }
}

// Jalankan Server
app.listen(PORT, async () => {
  await initializeDB();
  console.log(`🚀 BACKEND GARNETAMART MENYALA DI: http://localhost:${PORT}`);
});
