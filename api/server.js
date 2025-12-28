const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());

// 静的ファイルの配信設定
app.use(express.static(path.join(__dirname, 'public')));

// DB接続設定（環境変数を使用）
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false }, // Aiven接続に必須の設定
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4"
});

// データベース初期化（テーブル自動作成）
const initDb = () => {
    const createUsers = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL
        );
    `;
    const createReservations = `
        CREATE TABLE IF NOT EXISTS reservations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            vr_id INT,
            start_at DATETIME,
            end_at DATETIME
        );
    `;
    pool.query(createUsers, (err) => {
        if (err) console.error("Usersテーブル作成失敗:", err);
        else console.log("✅ Usersテーブル準備完了");
    });
    pool.query(createReservations, (err) => {
        if (err) console.error("Reservationsテーブル作成失敗:", err);
        else console.log("✅ Reservationsテーブル準備完了");
    });
};
initDb();

// --- API ルート ---

// 新規登録
app.post("/api/register", (req, res) => {
    const { name, email, password } = req.body;
    const sql = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
    pool.query(sql, [name, email, password], (err) => {
        if (err) return res.status(500).json({ error: "登録に失敗しました。" });
        res.status(201).json({ message: "登録成功" });
    });
});

// ログイン
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT id, name FROM users WHERE email = ? AND password = ?";
    pool.query(sql, [email, password], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "ログインに失敗しました。" });
        res.json({ userId: results[0].id, userName: results[0].name });
    });
});

// 在庫取得
app.get("/api/vr-status", (req, res) => {
    const sql = "SELECT vr_id FROM reservations WHERE end_at > NOW()";
    pool.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: "在庫取得失敗" });
        const rentedIds = results.map(r => r.vr_id);
        const availableIds = [];
        for (let i = 1; i <= 50; i++) { if (!rentedIds.includes(i)) availableIds.push(i); }
        res.json({ 
            availableCount: availableIds.length, 
            rentedCount: rentedIds.length, 
            nextAvailableId: availableIds[0] || null 
        });
    });
});

// 予約実行
app.post("/api/reserve", (req, res) => {
    const { user_id, vr_id, start_at, end_at } = req.body;
    const sql = "INSERT INTO reservations (user_id, vr_id, start_at, end_at) VALUES (?, ?, ?, ?)";
    pool.query(sql, [user_id, vr_id, start_at, end_at], (err) => {
        if (err) return res.status(500).json({ error: "予約に失敗しました。" });
        res.status(201).json({ vr_id });
    });
});

// 返却処理
app.post("/api/return", (req, res) => {
    const { vr_id } = req.body;
    const sql = "UPDATE reservations SET end_at = NOW() WHERE vr_id = ? AND end_at > NOW() ORDER BY start_at DESC LIMIT 1";
    pool.query(sql, [vr_id], (err, result) => {
        if (err || result.affectedRows === 0) return res.status(404).json({ error: "貸出中データが見つかりません。" });
        res.json({ message: "返却が完了しました。" });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server is running on port ${PORT}`);
});