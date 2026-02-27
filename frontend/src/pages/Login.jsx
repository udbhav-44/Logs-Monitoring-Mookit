import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, User, Lock, ArrowRight, Loader2, Zap, AlertTriangle, Server, Eye, EyeOff } from 'lucide-react';
import anime from 'animejs';

const LOG_LINES = [
    { cls: 'text-green-400', text: '[INFO]  2026-02-26 09:14:02  nginx: 200 GET /api/health' },
    { cls: 'text-yellow-400', text: '[WARN]  2026-02-26 09:14:05  memory usage at 78%' },
    { cls: 'text-green-400', text: '[INFO]  2026-02-26 09:14:09  worker-3: processed 512 events' },
    { cls: 'text-red-400', text: '[ERROR] 2026-02-26 09:14:11  db: connection timeout (retry 1/3)' },
    { cls: 'text-green-400', text: '[INFO]  2026-02-26 09:14:15  db: reconnected successfully' },
];

const FEATURES = [
    { Icon: Zap, label: 'Real-time log streaming' },
    { Icon: AlertTriangle, label: 'Anomaly detection' },
    { Icon: Server, label: 'System metrics' },
];

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();
    const cardRef = useRef(null);

    useEffect(() => {
        // Subtle scale spring on top of CSS slide-in
        anime({
            targets: cardRef.current,
            scale: [0.97, 1],
            duration: 600,
            easing: 'easeOutQuart',
        });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const baseUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5002`;
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Login failed');

            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data));

            anime({
                targets: cardRef.current,
                opacity: [1, 0],
                translateX: [0, 40],
                duration: 350,
                easing: 'easeInQuart',
                complete: () => navigate('/'),
            });
        } catch (err) {
            setError(err.message);
            anime({
                targets: cardRef.current,
                translateX: [0, -10, 10, -8, 8, -4, 4, 0],
                duration: 500,
                easing: 'easeInOutQuad',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex h-screen overflow-hidden">
            {/* ── LEFT PANEL ── */}
            <div className="hidden md:flex w-[55%] flex-col bg-gradient-to-br from-violet-600 via-blue-600 to-blue-700 relative overflow-hidden">
                {/* Dot-grid texture */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)',
                        backgroundSize: '28px 28px',
                    }}
                />

                {/* Floating orbs for depth */}
                <div className="orb-1 absolute -top-20 -left-20 w-80 h-80 glass-panel/10 rounded-full blur-3xl pointer-events-none" />
                <div className="orb-2 absolute -bottom-20 -right-10 w-72 h-72 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />

                {/* Logo + wordmark */}
                <div className="relative z-10 p-10">
                    <div className="flex items-center gap-3">
                        <div className="h-11 w-11 glass-panel/20 backdrop-blur rounded-xl flex items-center justify-center shadow-lg">
                            <Activity className="h-6 w-6 text-white" />
                        </div>
                        <span className="text-white font-bold text-xl tracking-tight">OOA Log Monitor</span>
                    </div>
                </div>

                {/* Feature bullets — vertically centered */}
                <div className="relative z-10 flex-1 flex flex-col justify-center px-14">
                    <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
                        Infrastructure<br />observability,<br />simplified.
                    </h1>
                    <p className="text-white/70 text-base mb-10 max-w-sm">
                        Monitor logs, detect anomalies, and track system health — all in one place.
                    </p>

                    <ul className="space-y-5">
                        {FEATURES.map(({ Icon, label }, i) => (
                            <li
                                key={label}
                                className="flex items-center gap-4 feature-bullet"
                                style={{ animationDelay: `${(i + 1) * 120}ms` }}
                            >
                                <div className="h-9 w-9 rounded-lg glass-panel/15 flex items-center justify-center flex-shrink-0">
                                    <Icon className="h-4 w-4 text-white" />
                                </div>
                                <span className="text-white/90 font-medium">{label}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Terminal widget */}
                <div className="relative z-10 mx-10 mb-10 glass-panel/10 backdrop-blur-md rounded-xl border border-white/20 p-4 font-mono text-xs">
                    <div className="flex items-center gap-1.5 mb-3">
                        <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                        <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
                        <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
                        <span className="ml-2 text-white/40 text-[10px]">system.log</span>
                    </div>
                    <div className="space-y-1.5">
                        {LOG_LINES.map((line, i) => (
                            <div
                                key={i}
                                className={`${line.cls}log-line-${i + 1}truncate`}
                            >
                                {line.text}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div
                ref={cardRef}
                className="login-card-enter flex-1 flex flex-col items-center justify-center bg-transparent px-8 md:px-16 relative"
            >
                {/* Mobile-only compact logo */}
                <div className="md:hidden flex items-center gap-2 mb-8">
                    <div className="h-9 w-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center">
                        <Activity className="h-5 w-5 text-white" />
                    </div>
                    <span className="font-bold text-gray-100 text-lg">OOA Log Monitor</span>
                </div>

                <div className="w-full max-w-sm">
                    <div className="mb-8">
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">
                            Welcome back
                        </h2>
                        <p className="mt-2 text-sm text-gray-400">
                            Sign in to your{' '}
                            <span className="font-semibold text-blue-600">OOA</span> account
                        </p>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        <div className="relative group">
                            <label htmlFor="username" className="sr-only">Username</label>
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                required
                                autoComplete="username"
                                className="block w-full pl-10 pr-3 py-3 glass-panel/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-400 transition-all outline-none"
                                placeholder="IITK User ID"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>

                        <div className="relative group">
                            <label htmlFor="password" className="sr-only">Password</label>
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                autoComplete="current-password"
                                className="block w-full pl-10 pr-10 py-3 glass-panel/5 border border-white/10 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white placeholder-gray-400 transition-all outline-none"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-blue-500 focus:outline-none"
                            >
                                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                            </button>
                        </div>

                        {error && (
                            <div className="glass-panel/5 border border-white/10 p-3 rounded-xl">
                                <p className="text-sm text-red-600 font-medium">{error}</p>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-tranneutral-y-0.5 active:tranneutral-y-0 mt-2"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    Sign in
                                    <ArrowRight className="ml-2 h-4 w-4 group-hover:tranneutral-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="absolute bottom-6 text-xs text-gray-400 select-none">
                    OOA Infrastructure · IITK
                </p>
            </div>
        </div>
    );
};

export default Login;
