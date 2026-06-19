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

// Gunakan URL langsung jika tersedia (paling aman untuk Railway)
const dbConnectionConfig = process.env.DATABASE_URL || process.env.MYSQL_URL || dbConfig;
console.log("Mencoba koneksi database...");

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
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [rows] = await connection.query("SELECT * FROM products");
    await connection.end();
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengambil produk", error_detail: error.message, config: { host: dbConfig.host, user: dbConfig.user, database: dbConfig.database, port: dbConfig.port } });
  }
});

// 2. Proses Checkout
app.post('/api/checkout', async (req, res) => {
  const { customer_name, customer_address, customer_phone, total_amount, shipping_fee, transport_type, customer_id, cart_items } = req.body;
  if (!customer_name || !customer_address || !total_amount) return res.status(400).json({ success: false, message: "Data tidak lengkap" });

  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    
    // Insert Order
    const [result] = await connection.query(
      "INSERT INTO orders (customer_name, customer_address, customer_phone, total_amount, shipping_fee, transport_type, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [customer_name, customer_address, customer_phone, total_amount, shipping_fee || 0, transport_type || 'motor', customer_id || null]
    );

    // Update Sales Count untuk item yang dibeli
    if (cart_items && Array.isArray(cart_items)) {
      for (const cartItem of cart_items) {
        if (cartItem.item && cartItem.item.id) {
          const qty = cartItem.qty || 1;
          await connection.query("UPDATE products SET sales_count = sales_count + ?, stock = GREATEST(0, stock - ?) WHERE id = ?", [qty, qty, cartItem.item.id]);
        }
      }
    }

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
    const connection = await mysql.createConnection(dbConnectionConfig);
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
    const connection = await mysql.createConnection(dbConnectionConfig);
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
    const connection = await mysql.createConnection(dbConnectionConfig);
    await connection.query("UPDATE orders SET status=? WHERE id=?", [status, id]);
    await connection.end();
    res.json({ success: true, message: "Status diperbarui" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal update status" });
  }
});

// 5b. Tugaskan Kurir
app.put('/api/orders/:id/assign', async (req, res) => {
  const { id } = req.params;
  const { courier_id } = req.body;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    await connection.query("UPDATE orders SET courier_id=?, status='Sedang Diantar' WHERE id=?", [courier_id, id]);
    await connection.end();
    res.json({ success: true, message: "Kurir ditugaskan" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal menugaskan kurir" });
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

    const connection = await mysql.createConnection(dbConnectionConfig);
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

    const connection = await mysql.createConnection(dbConnectionConfig);
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
    const connection = await mysql.createConnection(dbConnectionConfig);
    await connection.query("DELETE FROM products WHERE id=?", [id]);
    await connection.end();
    res.json({ success: true, message: "Produk dihapus" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal menghapus produk" });
  }
});

// --- API KURIR ---

// Tambah Kurir
app.post('/api/couriers', async (req, res) => {
  const { name, pin } = req.body;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [result] = await connection.query("INSERT INTO couriers (name, pin) VALUES (?, ?)", [name, pin]);
    await connection.end();
    res.json({ success: true, message: "Kurir ditambahkan", id: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menambah kurir (PIN mungkin sudah dipakai)" });
  }
});

// Ambil Daftar Kurir
app.get('/api/couriers', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [rows] = await connection.query("SELECT id, name, is_active FROM couriers ORDER BY name ASC");
    await connection.end();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil data kurir" });
  }
});

// Login Kurir
app.post('/api/couriers/login', async (req, res) => {
  const { pin } = req.body;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [rows] = await connection.query("SELECT * FROM couriers WHERE pin = ? AND is_active = true", [pin]);
    await connection.end();
    if (rows.length > 0) res.json({ success: true, message: "Login Berhasil", data: rows[0] });
    else res.status(401).json({ success: false, message: "PIN Salah atau Kurir tidak aktif" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Terjadi kesalahan sistem" });
  }
});

// Ambil Pesanan Milik Kurir
app.get('/api/couriers/:id/orders', async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    // Tampilkan order yang Sedang Diantar atau Selesai hari ini oleh kurir ini
    const [rows] = await connection.query("SELECT * FROM orders WHERE courier_id = ? ORDER BY id DESC", [id]);
    await connection.end();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil pesanan kurir" });
  }
});

// --- API CUSTOMER (PEMBELI) ---

// Register Customer
app.post('/api/customers/register', async (req, res) => {
  const { phone, password, name, address } = req.body;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    // Cek apakah nomor WA sudah terdaftar
    const [existing] = await connection.query("SELECT id FROM customers WHERE phone = ?", [phone]);
    if (existing.length > 0) {
      await connection.end();
      return res.status(400).json({ success: false, message: "Nomor WA sudah terdaftar!" });
    }
    
    // Insert pelanggan baru
    const [result] = await connection.query(
      "INSERT INTO customers (phone, password, name, address) VALUES (?, ?, ?, ?)",
      [phone, password, name, address]
    );
    await connection.end();
    
    res.json({ success: true, message: "Pendaftaran berhasil!", data: { id: result.insertId, phone, name, address } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mendaftar" });
  }
});

// Login Customer
app.post('/api/customers/login', async (req, res) => {
  const { phone, password } = req.body;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [rows] = await connection.query("SELECT id, phone, name, address FROM customers WHERE phone = ? AND password = ?", [phone, password]);
    await connection.end();
    
    if (rows.length > 0) {
      res.json({ success: true, message: "Login berhasil", data: rows[0] });
    } else {
      res.status(401).json({ success: false, message: "Nomor WA atau PIN/Password salah" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: "Kesalahan server" });
  }
});

// 12. Ambil Settings
app.get('/api/settings', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [rows] = await connection.query("SELECT setting_key, setting_value FROM settings");
    await connection.end();
    
    // Convert array of objects to key-value pairs
    const settingsObj = {};
    rows.forEach(r => { settingsObj[r.setting_key] = r.setting_value; });
    
    res.json({ success: true, data: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil pengaturan" });
  }
});

// 13. Ambil Daftar Banner
app.get('/api/banners', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [rows] = await connection.query("SELECT * FROM banners ORDER BY id DESC");
    await connection.end();
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal mengambil daftar banner" });
  }
});

// 14. Upload Banner Manual
app.post('/api/banners', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "Tidak ada file" });

  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [countCheck] = await connection.query("SELECT COUNT(*) as count FROM banners");
    if (countCheck[0].count >= 10) {
      await connection.end();
      return res.status(400).json({ success: false, message: "Maksimal 10 banner. Harap hapus banner lama." });
    }

    const filename = `banner-${Date.now()}.webp`;
    const filepath = path.join(__dirname, 'uploads', filename);
    await sharp(req.file.buffer)
      .resize(800) // Ukuran banner
      .webp({ quality: 80 })
      .toFile(filepath);
    const fileUrl = `/uploads/${filename}`;

    await connection.query("INSERT INTO banners (image_url, is_active) VALUES (?, 1)", [fileUrl]);
    await connection.end();
    res.json({ success: true, message: "Banner berhasil diunggah", url: fileUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Gagal mengunggah banner" });
  }
});

// 15. Generate Banner via AI (Pollinations)
app.post('/api/banners/ai', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ success: false, message: "Prompt wajib diisi" });

  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    const [countCheck] = await connection.query("SELECT COUNT(*) as count FROM banners");
    if (countCheck[0].count >= 10) {
      await connection.end();
      return res.status(400).json({ success: false, message: "Maksimal 10 banner. Harap hapus banner lama." });
    }

    const seed = Math.floor(Math.random() * 100000);
    const aiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=400&nologo=true&seed=${seed}`;
    
    const response = await fetch(aiUrl);
    if (!response.ok) throw new Error("Gagal mengambil gambar dari AI");
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const filename = `banner-ai-${Date.now()}.webp`;
    const filepath = path.join(__dirname, 'uploads', filename);
    await sharp(buffer)
      .webp({ quality: 80 })
      .toFile(filepath);
      
    const fileUrl = `/uploads/${filename}`;

    await connection.query("INSERT INTO banners (image_url, is_active) VALUES (?, 1)", [fileUrl]);
    await connection.end();

    res.json({ success: true, message: "Banner AI berhasil dibuat dan ditambahkan", url: fileUrl });
  } catch (error) {
    console.error("AI Banner Error:", error);
    res.status(500).json({ success: false, message: "Gagal mengenerate banner AI" });
  }
});

// 16. Toggle Active Status
app.put('/api/banners/:id', async (req, res) => {
  const { is_active } = req.body;
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    await connection.query("UPDATE banners SET is_active = ? WHERE id = ?", [is_active ? 1 : 0, req.params.id]);
    await connection.end();
    res.json({ success: true, message: "Status banner diperbarui" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal update banner" });
  }
});

// 17. Hapus Banner
app.delete('/api/banners/:id', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    await connection.query("DELETE FROM banners WHERE id = ?", [req.params.id]);
    await connection.end();
    res.json({ success: true, message: "Banner dihapus" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Gagal menghapus banner" });
  }
});

// Otomatis membuat tabel jika belum ada (berguna untuk Railway)
async function initializeDB() {
  try {
    const connection = await mysql.createConnection(dbConnectionConfig);
    
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
        sales_count INT DEFAULT 0,
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
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS couriers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        pin VARCHAR(20) NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        address TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value TEXT NOT NULL
      );
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_url VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Inisialisasi default settings
    await connection.query(`
      INSERT IGNORE INTO settings (setting_key, setting_value)
      VALUES 
        ('promo_banner_url', '/promo_banner.png'),
        ('promo_banner_active', '1')
    `);

    // Migrasi Alter Table aman
    try { await connection.query("ALTER TABLE orders ADD COLUMN shipping_fee INT DEFAULT 0"); } catch(e) {}
    try { await connection.query("ALTER TABLE orders ADD COLUMN transport_type VARCHAR(50) DEFAULT 'motor'"); } catch(e) {}
    try { await connection.query("ALTER TABLE orders ADD COLUMN courier_id INT"); } catch(e) {}
    try { await connection.query("ALTER TABLE orders ADD COLUMN customer_id INT"); } catch(e) {}
    try { await connection.query("ALTER TABLE products ADD COLUMN sales_count INT DEFAULT 0"); } catch(e) {}
    
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
