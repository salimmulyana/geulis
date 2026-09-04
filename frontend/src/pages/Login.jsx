import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const canvasRef = useRef(null);
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const generateCaptcha = () => {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setCaptchaInput('');
    drawCaptcha(code);
  };

  const drawCaptcha = (code) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Background noise
    ctx.fillStyle = '#f3f4f6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw dots
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255}, 0.5)`;
      ctx.beginPath();
      ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, 2 * Math.PI);
      ctx.fill();
    }
    
    // Draw lines
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(${Math.random()*255},${Math.random()*255},${Math.random()*255}, 0.5)`;
      ctx.beginPath();
      ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
      ctx.stroke();
    }
    
    // Draw text
    ctx.font = 'bold 30px "Courier New", monospace';
    ctx.fillStyle = '#1f2937';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Jiggle each letter
    for (let i = 0; i < code.length; i++) {
      ctx.save();
      const x = 30 + (i * 30);
      const y = canvas.height / 2 + (Math.random() * 10 - 5);
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 0.4);
      ctx.fillText(code[i], 0, 0);
      ctx.restore();
    }
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validasi CAPTCHA
    if (captchaInput !== captchaCode) {
      setError('Kode keamanan salah! Silakan coba lagi.');
      generateCaptcha();
      return;
    }

    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
      generateCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card card" onSubmit={handleSubmit}>
        <div className="login-header">
          <span className="logo">🧬</span>
          <h1>GeuLIS</h1>
          <p>Laboratory Information System</p>
        </div>
        <div className="form-group">
          <label>Username</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <div className="form-group">
          <label>Kode Keamanan</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <canvas 
                ref={canvasRef} 
                width="180" 
                height="50" 
                style={{ border: '1px solid var(--border)', borderRadius: '4px', background: '#f3f4f6' }}
              />
              <button type="button" className="secondary btn-sm" onClick={generateCaptcha} style={{ padding: '0 1rem', height: '50px' }} title="Ganti Gambar">
                🔄
              </button>
            </div>
            <input 
              type="text" 
              value={captchaInput} 
              onChange={(e) => setCaptchaInput(e.target.value)} 
              placeholder="Ketik angka di atas..." 
              required 
              maxLength={5}
            />
          </div>
        </div>
        {error && <p className="error-msg">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? 'Masuk...' : 'Masuk'}</button>
        <p className="hint">
          Sandi awal dibuat acak saat pemasangan dan tercatat di
          <code> SANDI_AWAL.txt</code> pada server.
        </p>
      </form>
      <style>{`
        .login-page {
          min-height: 100vh; display: flex; align-items: center; justify-content: center;
          background: radial-gradient(ellipse at top, #1e3a5f 0%, var(--bg) 60%);
          padding: 1rem;
        }
        .login-card { width: 100%; max-width: 400px; }
        .login-header { text-align: center; margin-bottom: 1.5rem; }
        .logo { font-size: 3rem; display: block; margin-bottom: 0.5rem; }
        .login-header p { color: var(--muted); font-size: 0.9rem; }
        .login-card .form-group { margin-bottom: 1rem; }
        .login-card button { width: 100%; margin-top: 0.5rem; padding: 0.75rem; }
        .hint { text-align: center; font-size: 0.75rem; color: var(--muted); margin-top: 1rem; }
        .loading-screen { display: flex; align-items: center; justify-content: center; min-height: 100vh; color: var(--muted); }
      `}</style>
    </div>
  );
}
