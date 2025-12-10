// server.js - FULL VERSION dengan adminpage baru
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const app = express();

// Konfigurasi database
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'giegieboneofficial'
});

// Koneksi ke database
db.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        return;
    }
    console.log('Connected to MySQL database');
    
    // Buat tabel jika belum ada
    createTables();
});

function createTables() {
    // Tabel users
    const usersTable = `
        CREATE TABLE IF NOT EXISTS users (
            user_id INT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            address TEXT,
            role ENUM('admin', 'user') DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    // Tabel products
    const productsTable = `
        CREATE TABLE IF NOT EXISTS products (
            product_id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            stock INT DEFAULT 0,
            image VARCHAR(255),
            category VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    db.execute(usersTable, (err) => {
        if (err) console.error('Error creating users table:', err);
    });
    
    db.execute(productsTable, (err) => {
        if (err) console.error('Error creating products table:', err);
    });
    
    // Cek dan tambahkan admin default
    const checkAdmin = `SELECT * FROM users WHERE username = 'admin'`;
    db.execute(checkAdmin, (err, results) => {
        if (err) {
            console.error('Error checking admin:', err);
            return;
        }
        
        if (results.length === 0) {
            const insertAdmin = `
                INSERT INTO users (username, password, address, role) 
                VALUES ('admin', 'admin123', 'Admin Address', 'admin')
            `;
            db.execute(insertAdmin, (err) => {
                if (err) {
                    console.error('Error inserting admin:', err);
                } else {
                    console.log('Default admin created: username=admin, password=admin123');
                }
            });
        }
    });
    
    // Buat folder uploads
    const uploadDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created uploads directory');
    }
}

// Konfigurasi Multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public', 'uploads'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Hanya file gambar yang diperbolehkan'));
    }
});

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(session({
    secret: 'giegiebone_secret_key_2025',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Set view engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware untuk file static
app.use(express.static(path.join(__dirname, 'public')));

// Middleware untuk cek authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

const isAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Access denied. Admin only.');
    }
};

// ROUTES

// Halaman utama
app.get('/', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            res.redirect('/adminpage');
        } else {
            res.redirect('/product');
        }
    } else {
        res.redirect('/login');
    }
});

// Halaman login
app.get('/login', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            res.redirect('/adminpage');
        } else {
            res.redirect('/product');
        }
    } else {
        const alertMessage = req.session.alertMessage || '';
        const alertType = req.session.alertType || '';
        
        // Hapus session alert setelah digunakan
        if (req.session.alertMessage) {
            delete req.session.alertMessage;
            delete req.session.alertType;
        }
        
        res.render('login', { 
            alertMessage: alertMessage,
            alertType: alertType
        });
    }
});

// Proses login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.render('login', { 
            alertMessage: 'Username dan password harus diisi!',
            alertType: 'error'
        });
    }
    
    const query = 'SELECT * FROM users WHERE username = ? AND password = ?';
    
    db.execute(query, [username, password], (err, results) => {
        if (err) {
            console.error('Login error:', err);
            return res.render('login', { 
                alertMessage: 'Terjadi kesalahan database!',
                alertType: 'error'
            });
        }
        
        if (results.length > 0) {
            const user = results[0];
            
            req.session.user = {
                user_id: user.user_id,
                username: user.username,
                role: user.role,
                address: user.address
            };
            
            // HANYA untuk user biasa, admin tidak pakai alert
            if (user.role === 'admin') {
                // Admin langsung redirect tanpa alert
                res.redirect('/adminpage');
            } else {
                // User tetap pakai alert
                req.session.alertMessage = `Login berhasil! Selamat datang ${user.username}`;
                req.session.alertType = 'success';
                res.redirect('/product');
            }
        } else {
            res.render('login', { 
                alertMessage: 'Username atau password salah!',
                alertType: 'error'
            });
        }
    });
});

// Halaman register
app.get('/register', (req, res) => {
    if (req.session.user) {
        if (req.session.user.role === 'admin') {
            res.redirect('/adminpage');
        } else {
            res.redirect('/product');
        }
    } else {
        const alertMessage = req.session.alertMessage || '';
        const alertType = req.session.alertType || '';
        
        if (req.session.alertMessage) {
            delete req.session.alertMessage;
            delete req.session.alertType;
        }
        
        res.render('users', { 
            alertMessage: alertMessage,
            alertType: alertType
        });
    }
});

// Proses register - tanpa batas password
app.post('/register', (req, res) => {
    const { username, password, address } = req.body;
    
    // Validasi input
    if (!username || !password || !address) {
        return res.render('users', { 
            alertMessage: 'Semua field harus diisi!',
            alertType: 'error'
        });
    }
    
    // Cek apakah username sudah ada
    const checkQuery = 'SELECT * FROM users WHERE username = ?';
    db.execute(checkQuery, [username], (err, results) => {
        if (err) {
            console.error('Register check error:', err);
            return res.render('users', { 
                alertMessage: 'Terjadi kesalahan database!',
                alertType: 'error'
            });
        }
        
        if (results.length > 0) {
            return res.render('users', { 
                alertMessage: 'Username sudah digunakan!',
                alertType: 'error'
            });
        }
        
        // Insert user baru (HANYA USER, BUKAN ADMIN)
        const insertQuery = 'INSERT INTO users (username, password, address, role) VALUES (?, ?, ?, "user")';
        db.execute(insertQuery, [username, password, address], (err, results) => {
            if (err) {
                console.error('Register insert error:', err);
                return res.render('users', { 
                    alertMessage: 'Registrasi gagal!',
                    alertType: 'error'
                });
            }
            
            // Set alert di session untuk halaman login
            req.session.alertMessage = 'Registrasi berhasil! Silakan login';
            req.session.alertType = 'success';
            res.redirect('/login');
        });
    });
});

// Halaman produk untuk user
app.get('/product', isAuthenticated, (req, res) => {
    // Cek jika ada alert dari login
    const alertMessage = req.session.alertMessage || '';
    const alertType = req.session.alertType || '';
    
    if (req.session.alertMessage) {
        delete req.session.alertMessage;
        delete req.session.alertType;
    }
    
    const query = 'SELECT * FROM products ORDER BY created_at DESC';
    
    db.execute(query, (err, products) => {
        if (err) {
            console.error('Product fetch error:', err);
            products = [];
        }
        
        res.render('product', { 
            user: req.session.user,
            products: products,
            alertMessage: alertMessage,
            alertType: alertType
        });
    });
});

// Halaman admin - TANPA ALERT
app.get('/adminpage', isAdmin, (req, res) => {
    const productQuery = 'SELECT * FROM products ORDER BY created_at DESC';
    const userQuery = 'SELECT * FROM users ORDER BY created_at DESC';
    
    db.execute(productQuery, (err, products) => {
        if (err) {
            console.error('Admin product fetch error:', err);
            products = [];
        }
        
        db.execute(userQuery, (err, users) => {
            if (err) {
                console.error('Admin user fetch error:', err);
                users = [];
            }
            
            const stats = {
                totalProducts: products.length,
                totalUsers: users.length,
                totalRevenue: 0
            };
            
            res.render('adminpage', {
                user: req.session.user,
                products: products,
                users: users,
                stats: stats
            });
        });
    });
});

// API untuk tambah product
app.post('/api/products', isAdmin, upload.single('image'), (req, res) => {
    const { name, description, price, stock, category } = req.body;
    const image = req.file ? '/uploads/' + req.file.filename : null;
    
    const query = `INSERT INTO products (name, description, price, stock, image, category) 
                   VALUES (?, ?, ?, ?, ?, ?)`;
    
    db.execute(query, [name, description, price, stock, image, category], (err, result) => {
        if (err) {
            console.error('Add product error:', err);
            return res.status(500).json({ error: 'Failed to add product' });
        }
        
        res.json({ success: true, message: 'Product added successfully', productId: result.insertId });
    });
});

// API untuk get product detail
app.get('/api/products/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    
    const query = 'SELECT * FROM products WHERE product_id = ?';
    db.execute(query, [productId], (err, results) => {
        if (err) {
            console.error('Get product error:', err);
            return res.status(500).json({ error: 'Failed to get product' });
        }
        
        if (results.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json(results[0]);
    });
});

// API untuk edit product
app.put('/api/products/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    const { name, description, price, stock, category } = req.body;
    
    const updateQuery = `UPDATE products SET 
                        name = ?, description = ?, price = ?, 
                        stock = ?, category = ? 
                        WHERE product_id = ?`;
    
    db.execute(updateQuery, [name, description, price, stock, category, productId], (err) => {
        if (err) {
            console.error('Update product error:', err);
            return res.status(500).json({ error: 'Failed to update product' });
        }
        
        res.json({ success: true, message: 'Product updated successfully' });
    });
});

// API untuk edit product image
app.put('/api/products/:id/image', isAdmin, upload.single('image'), (req, res) => {
    const productId = req.params.id;
    
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const image = '/uploads/' + req.file.filename;
    
    const updateQuery = `UPDATE products SET image = ? WHERE product_id = ?`;
    
    db.execute(updateQuery, [image, productId], (err) => {
        if (err) {
            console.error('Update product image error:', err);
            return res.status(500).json({ error: 'Failed to update product image' });
        }
        
        res.json({ success: true, message: 'Product image updated successfully' });
    });
});

// API untuk delete product
app.delete('/api/products/:id', isAdmin, (req, res) => {
    const productId = req.params.id;
    
    const query = 'DELETE FROM products WHERE product_id = ?';
    db.execute(query, [productId], (err) => {
        if (err) {
            console.error('Delete product error:', err);
            return res.status(500).json({ error: 'Failed to delete product' });
        }
        
        res.json({ success: true, message: 'Product deleted successfully' });
    });
});

// API untuk delete user
app.delete('/api/users/:id', isAdmin, (req, res) => {
    const userId = req.params.id;
    
    // Cek jika user adalah admin
    const checkQuery = 'SELECT * FROM users WHERE user_id = ? AND role = "admin"';
    db.execute(checkQuery, [userId], (err, results) => {
        if (err) {
            console.error('Check user error:', err);
            return res.status(500).json({ error: 'Failed to check user' });
        }
        
        if (results.length > 0) {
            return res.status(400).json({ error: 'Cannot delete admin user' });
        }
        
        const deleteQuery = 'DELETE FROM users WHERE user_id = ?';
        db.execute(deleteQuery, [userId], (err) => {
            if (err) {
                console.error('Delete user error:', err);
                return res.status(500).json({ error: 'Failed to delete user' });
            }
            
            res.json({ success: true, message: 'User deleted successfully' });
        });
    });
});

// Logout
app.get('/logout', (req, res) => {
    if (req.session.user) {
        const username = req.session.user.username;
        req.session.destroy((err) => {
            if (err) {
                console.error('Logout error:', err);
            }
            // Set alert untuk halaman login
            req.session = {};
            req.session.alertMessage = `Logout berhasil! Sampai jumpa ${username}`;
            req.session.alertType = 'info';
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Halaman tidak ditemukan');
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File terlalu besar. Maksimal 5MB.' });
        }
    }
    
    res.status(500).send('Terjadi kesalahan server');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Access the application at http://localhost:${PORT}`);
    console.log(`=========================================`);
    console.log(`🔑 Admin login credentials:`);
    console.log(`   Username: admin`);
    console.log(`   Password: admin123`);
    console.log(`=========================================`);
    console.log(`👤 User: Register new account at /register`);
    console.log(`🛍️  User page: /product`);
    console.log(`⚙️  Admin page: /adminpage`);
    console.log(`=========================================`);
});