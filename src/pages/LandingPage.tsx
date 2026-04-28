import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Droplets, Activity, ShieldCheck, ArrowRight, 
  Zap, Waves, Github, Linkedin, Mail, Menu, X, Cpu, 
  User, Lock, Mail as MailIcon, AlertCircle
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { loginWithGoogle, logout, loginWithEmail, signUpWithEmail } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      await loginWithGoogle();
      if (isMenuOpen) setIsMenuOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmail(email, password, name);
      } else {
        await loginWithEmail(email, password);
      }
      setShowEmailAuth(false);
      if (isMenuOpen) setIsMenuOpen(false);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (mode: 'signin' | 'signup' = 'signup') => {
    if (user) {
      navigate('/dashboard');
    } else {
      setIsSignUp(mode === 'signup');
      setShowEmailAuth(true);
    }
  };

  return (
    <div className="relative overflow-hidden bg-[#FBFBFD] min-h-screen">
      {/* Soft Background Blurs */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[10%] w-[60%] h-[60%] bg-blue-100/50 rounded-full blur-[140px] animate-float" />
        <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] bg-cyan-50/60 rounded-full blur-[120px]" />
      </div>

      <nav className="relative z-[100] flex items-center justify-between px-6 md:px-8 py-8 max-w-7xl mx-auto">
        <Link to="/" className="flex items-center gap-3 active:scale-95 transition-transform">
          <div className="w-10 h-10 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Waves className="text-white" size={22} />
          </div>
          <span className="text-xl font-bold tracking-tight text-[#1D1D1F]">Mal Flow</span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-10">
          <div className="flex gap-8 text-[13px] font-medium text-[#86868B]">
            <a href="#technology" className="hover:text-[#1D1D1F] transition-colors">Technology</a>
            <a href="#sustainability" className="hover:text-[#1D1D1F] transition-colors">Sustainability</a>
            <a href="#support" className="hover:text-[#1D1D1F] transition-colors">Support</a>
          </div>
        </div>

        {/* Desktop Action Area */}
        <div className="hidden lg:flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-3">
              <Link to="/dashboard" className="px-5 py-2.5 bg-[#1D1D1F] text-white rounded-full hover:bg-black transition-all text-[13px] font-semibold whitespace-nowrap">
                Go to Dashboard
              </Link>
              <button onClick={logout} className="text-[#86868B] text-[13px] font-semibold hover:text-[#1D1D1F] transition-colors">
                Log Out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowEmailAuth(true)}
                className="text-[13px] font-semibold text-[#86868B] hover:text-[#1D1D1F] transition-colors"
              >
                Sign In
              </button>
              <button 
                onClick={handleLogin}
                className="px-5 py-2.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-all text-[13px] font-semibold whitespace-nowrap shadow-lg shadow-blue-500/20"
              >
                Get Started
              </button>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Toggle */}
        <button 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="lg:hidden w-10 h-10 flex items-center justify-center text-[#1D1D1F] bg-white rounded-full shadow-sm border border-zinc-100 relative z-[110]"
        >
          {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed inset-0 top-0 left-0 w-full h-screen bg-white/95 backdrop-blur-2xl z-[105] flex flex-col p-8 pt-32 lg:hidden"
            >
              <div className="flex flex-col gap-8 text-3xl font-bold text-[#1D1D1F] mb-12 text-left">
                <a href="#technology" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-500 transition-colors">Technology</a>
                <a href="#sustainability" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-500 transition-colors">Sustainability</a>
                <a href="#support" onClick={() => setIsMenuOpen(false)} className="hover:text-blue-500 transition-colors">Support</a>
              </div>

              <div className="mt-auto pb-12 space-y-4">
                {user ? (
                  <>
                    <Link 
                      to="/dashboard" 
                      onClick={() => setIsMenuOpen(false)}
                      className="flex items-center justify-center w-full py-5 bg-[#1D1D1F] text-white rounded-2xl text-lg font-bold shadow-xl active:scale-95 transition-all"
                    >
                      Go to Dashboard
                    </Link>
                    <button 
                      onClick={() => { logout(); setIsMenuOpen(false); }}
                      className="w-full text-center py-4 text-[#86868B] text-lg font-semibold hover:text-red-500 transition-colors"
                    >
                      Log Out
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => { setShowEmailAuth(true); setIsMenuOpen(false); }}
                    className="flex items-center justify-center w-full py-5 bg-blue-500 text-white rounded-2xl text-lg font-bold shadow-xl shadow-blue-500/20 active:scale-95 transition-all"
                  >
                    Sign In
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Email Auth Modal */}
      <AnimatePresence>
        {showEmailAuth && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEmailAuth(false)}
              className="absolute inset-0 bg-[#1D1D1F]/40 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-10"
            >
              <button 
                onClick={() => setShowEmailAuth(false)}
                className="absolute top-6 right-6 p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="mb-8">
                <h2 className="text-3xl font-bold tracking-tight text-[#1D1D1F] mb-2">
                  {isSignUp ? 'Create account' : 'Welcome back'}
                </h2>
                <p className="text-[#86868B] font-medium">
                  {isSignUp ? 'Start managing your flow today.' : 'Sign in to access your dashboard.'}
                </p>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isSignUp && (
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                    <input 
                      type="text" 
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full pl-12 pr-4 py-4 bg-[#F5F5F7] border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-all"
                    />
                  </div>
                )}
                <div className="relative">
                  <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="email" 
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-[#F5F5F7] border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
                  <input 
                    type="password" 
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-4 bg-[#F5F5F7] border-none rounded-2xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-4 bg-red-50 text-red-500 rounded-2xl text-xs font-bold">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-blue-500 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-600 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    isSignUp ? 'Sign Up' : 'Sign In'
                  )}
                </button>
              </form>

              <div className="mt-8 pt-8 border-t border-[#F5F5F7]">
                <button 
                  onClick={handleLogin}
                  className="w-full py-4 bg-white border border-zinc-200 text-[#1D1D1F] rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-zinc-50 transition-all"
                >
                  <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                  Continue with Google
                </button>
              </div>

              <p className="mt-8 text-center text-sm font-medium text-[#86868B]">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                <button 
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="ml-1 text-blue-500 font-bold hover:underline"
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="relative z-10 px-6 md:px-8 pt-6 md:pt-12 pb-24 md:pb-32 max-w-7xl mx-auto text-center">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.8, ease: "easeOut" }}
           className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 mb-8 md:mb-10">
            <Zap size={14} />
            <span className="text-[11px] md:text-[12px] font-semibold tracking-tight">Introducing Mal Flow V2</span>
          </div>
          
          <h1 className="text-5xl md:text-8xl font-bold tracking-tight text-[#1D1D1F] mb-6 md:mb-8 leading-[1.1] md:leading-[1.05]">
            Water management, <br className="hidden md:block" /> 
            <span className="text-blue-500">beautifully simplified.</span>
          </h1>
          
          <p className="text-lg md:text-2xl text-[#86868B] max-w-2xl mx-auto mb-10 md:mb-14 leading-relaxed font-medium">
            Control your home's water flow with surgical precision and elegant insights. Designed to flow with your life.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 md:gap-6 mb-20 md:mb-24">
            <button 
              onClick={() => handleAction('signup')}
              className="w-full sm:w-auto px-10 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-semibold text-lg transition-all shadow-xl shadow-blue-500/25 active:scale-[0.98] text-center"
            >
              {user ? 'Go to Dashboard' : 'Get Started'}
            </button>
            <button 
              onClick={() => document.getElementById('technology')?.scrollIntoView({ behavior: 'smooth' })}
              className="group flex items-center gap-2 text-blue-500 font-semibold text-lg hover:underline underline-offset-4"
            >
              Learn more
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>

        {/* Dynamic Visual Area - Poetic Fluid Animation */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.2 }}
          className="relative max-w-5xl mx-auto"
        >
          <div className="aspect-[1/1] md:aspect-[21/9] rounded-[2.5rem] md:rounded-[4rem] bg-white shadow-[0_40px_100px_rgba(0,0,0,0.06)] border border-white/60 overflow-hidden flex items-center justify-center p-4">
            <div className="w-full h-full rounded-[2rem] md:rounded-[3.2rem] bg-gradient-to-br from-blue-50/50 via-white to-cyan-50/50 relative overflow-hidden">
               
               {/* Poetic Fluid Animation */}
               <div className="absolute inset-0 flex items-center justify-center">
                 {/* Floating Glassy Blobs */}
                 <motion.div
                   animate={{ 
                     x: [0, 30, -20, 0],
                     y: [0, -40, 20, 0],
                     scale: [1, 1.1, 0.9, 1]
                   }}
                   transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                   className="absolute w-64 h-64 md:w-96 md:h-96 bg-blue-400/10 rounded-full blur-[60px]"
                 />
                 <motion.div
                   animate={{ 
                     x: [0, -50, 40, 0],
                     y: [0, 30, -50, 0],
                     scale: [1, 0.8, 1.2, 1]
                   }}
                   transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                   className="absolute w-48 h-48 md:w-80 md:h-80 bg-cyan-400/10 rounded-full blur-[50px]"
                 />
                 
                 {/* Abstract Water Orb */}
                 <div className="relative z-10">
                    <div className="relative">
                      <motion.div
                        animate={{ 
                          borderRadius: ["40% 60% 70% 30% / 40% 50% 60% 50%", "60% 40% 30% 70% / 50% 60% 40% 60%", "40% 60% 70% 30% / 40% 50% 60% 50%"]
                        }}
                        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                        className="w-40 h-40 md:w-56 md:h-56 bg-gradient-to-tr from-blue-500 to-cyan-400 p-[2px] shadow-2xl shadow-blue-500/20"
                      >
                         <div className="w-full h-full bg-white rounded-[inherit] flex items-center justify-center overflow-hidden">
                            <motion.div
                              animate={{ 
                                y: [20, -20, 20],
                                rotate: [0, 5, -5, 0]
                              }}
                              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                            >
                              <Waves className="text-blue-500 opacity-60" size={64} />
                            </motion.div>
                         </div>
                      </motion.div>
                      
                      {/* Interactive Floating Rings */}
                      {[...Array(3)].map((_, i) => (
                        <motion.div
                          key={i}
                          className="absolute inset-0 border border-blue-200/50 rounded-full"
                          initial={{ scale: 1, opacity: 0 }}
                          animate={{ scale: 1.8, opacity: [0, 0.5, 0] }}
                          transition={{ duration: 4, repeat: Infinity, delay: i * 1.3, ease: "easeOut" }}
                        />
                      ))}
                    </div>
                 </div>

                 {/* Minimalist Message */}
                 <div className="absolute bottom-10 left-0 right-0 text-center">
                    <span className="text-[11px] font-bold text-blue-500/50 uppercase tracking-[0.3em]">Pure Harmony</span>
                 </div>
               </div>
            </div>
          </div>
        </motion.div>

        {/* Feature Sections */}
        <div className="mt-40 grid md:grid-cols-3 gap-12 max-w-6xl mx-auto mb-40">
          {[
            { title: "Flow Metering", desc: "Digital tracking for every drop. Analyze your consumption patterns with precise, real-time data.", icon: Activity, color: "bg-blue-50 text-blue-500" },
            { title: "Leak Guard", desc: "Get instant notifications if unusual flow is detected. Protect your property with early warnings.", icon: ShieldCheck, color: "bg-green-50 text-green-500" },
            { title: "Smart Insights", desc: "Gain visibility into your water usage and optimize patterns to save resources and costs.", icon: Zap, color: "bg-orange-50 text-orange-500" }
          ].map((f, i) => (
            <div key={i} className="text-center group">
              <div className={`w-16 h-16 ${f.color} rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-sm transition-transform group-hover:scale-110 shadow-lg`}>
                <f.icon size={32} />
              </div>
              <h3 className="text-2xl font-bold text-[#1D1D1F] mb-4">{f.title}</h3>
              <p className="text-[#86868B] leading-relaxed font-medium">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Technology Section */}
        <section id="technology" className="py-32 border-t border-zinc-100/50">
          <div className="max-w-4xl mx-auto text-center px-4">
            <h2 className="text-sm font-black text-blue-500 uppercase tracking-[0.3em] mb-6">Technology</h2>
            <h3 className="text-4xl md:text-6xl font-bold text-[#1D1D1F] mb-12 leading-tight">Driven by ESP32. <br/>Crafted for performance.</h3>
            
            <div className="grid md:grid-cols-2 gap-12 text-left">
              <div className="space-y-6">
                <p className="text-lg text-[#86868B] leading-relaxed font-medium">
                  At the heart of Mal Flow lies a custom ESP32-powered module that samples water flow data thousands of times per second. This high-frequency sampling allows for precise detection of even the smallest anomalies.
                </p>
                <div className="p-8 bg-white border border-zinc-100 rounded-[2.5rem] shadow-sm">
                  <Cpu className="text-blue-500 mb-6" size={32} />
                  <h4 className="text-xl font-bold mb-2">Real-time Sync</h4>
                  <p className="text-sm text-[#86868B] font-medium leading-relaxed">
                    Data is pushed to our secure cloud every hour, providing you with up-to-date insights without draining battery.
                  </p>
                </div>
              </div>
              <div className="space-y-6">
                <div className="p-8 bg-[#1D1D1F] text-white rounded-[2.5rem] shadow-xl">
                  <Activity className="text-blue-400 mb-6" size={32} />
                  <h4 className="text-xl font-bold mb-2">Precision Analytics</h4>
                  <p className="text-sm text-zinc-400 font-medium leading-relaxed">
                    Our algorithms process flow signatures to distinguish between regular usage and potential leaks, ensuring reliable alerts.
                  </p>
                </div>
                <p className="text-lg text-[#86868B] leading-relaxed font-medium">
                  We value privacy above all. Your data is encrypted end-to-end, meaning only you have access to your consumption patterns. No third-party tracking, no compromises.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sustainability Section */}
        <section id="sustainability" className="py-32 bg-white rounded-[4rem] my-20">
          <div className="max-w-4xl mx-auto text-center px-4">
            <h2 className="text-sm font-black text-green-500 uppercase tracking-[0.3em] mb-6">Sustainability</h2>
            <h3 className="text-4xl md:text-6xl font-bold text-[#1D1D1F] mb-12 leading-tight">Every drop counts <br/>for our planet.</h3>
            
            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {[
                { val: "25%", label: "Average Savings", desc: "Users reduce water waste by tracking daily patterns." },
                { val: "Zero", label: "Hidden Leaks", desc: "Detect and stop silent leaks before they cause damage." },
                { val: "100%", label: "Awareness", desc: "Understand your footprint and make more conscious choices." }
              ].map((stat, i) => (
                <div key={i} className="p-8 bg-[#FBFBFD] rounded-[2rem] border border-zinc-100">
                  <div className="text-4xl font-black text-green-500 mb-2">{stat.val}</div>
                  <div className="text-sm font-bold text-[#1D1D1F] mb-3 uppercase tracking-wider">{stat.label}</div>
                  <p className="text-xs text-[#86868B] font-medium leading-relaxed">{stat.desc}</p>
                </div>
              ))}
            </div>
            
            <p className="text-xl text-[#86868B] leading-relaxed max-w-2xl mx-auto font-medium italic">
              "Sustainability starts with measurement. By giving you visibility into your home's water flow, we empower you to protect our most precious resource."
            </p>
          </div>
        </section>

        {/* Support Section */}
        <section id="support" className="py-32">
          <div className="max-w-4xl mx-auto text-center px-4">
            <h2 className="text-sm font-black text-orange-500 uppercase tracking-[0.3em] mb-6">Support</h2>
            <h3 className="text-4xl md:text-6xl font-bold text-[#1D1D1F] mb-12">We're here to help.</h3>
            
            <div className="grid md:grid-cols-2 gap-8 text-left">
              <div className="p-10 bg-white border border-zinc-100 rounded-[3rem] shadow-sm hover:shadow-md transition-all">
                <h4 className="text-2xl font-bold mb-4">On-site Assistance</h4>
                <p className="text-[#86868B] font-medium leading-relaxed mb-8 text-lg">
                  Need help with the physical installation or valve maintenance? Our experts are available for on-site support.
                </p>
                <a href="mailto:specialist@malflow.com?subject=Installation%20Support" className="inline-flex items-center gap-2 text-blue-500 font-bold hover:underline">
                  Contact Specialist <ArrowRight size={16} />
                </a>
              </div>
              <div className="p-10 bg-white border border-zinc-100 rounded-[3rem] shadow-sm hover:shadow-md transition-all">
                <h4 className="text-2xl font-bold mb-4">Help Center</h4>
                <p className="text-[#86868B] font-medium leading-relaxed mb-8 text-lg">
                  Browse our documentation for troubleshooting, setup guides, and best practices for your Mal Flow system.
                </p>
                <div className="flex gap-4">
                  <button className="px-6 py-2 bg-[#F5F5F7] rounded-full text-sm font-bold hover:bg-[#E5E5E7] transition-all">
                    FAQs
                  </button>
                  <button className="px-6 py-2 bg-[#F5F5F7] rounded-full text-sm font-bold hover:bg-[#E5E5E7] transition-all">
                    Guides
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-8 py-20 border-t border-zinc-100/50 max-w-7xl mx-auto flex flex-col items-center justify-between gap-12">
        <div className="flex flex-col md:flex-row items-center justify-between w-full gap-8">
          <div className="text-[13px] font-medium text-[#86868B]">© 2026 Mal Flow Ecosystem. All rights reserved.</div>
          
          <div className="flex items-center gap-6">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white border border-zinc-100 flex items-center justify-center text-[#86868B] hover:text-blue-500 hover:border-blue-100 transition-all shadow-sm">
              <Github size={20} />
            </a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-white border border-zinc-100 flex items-center justify-center text-[#86868B] hover:text-blue-500 hover:border-blue-100 transition-all shadow-sm">
              <Linkedin size={20} />
            </a>
            <a href="mailto:contact@malflow.com" className="w-10 h-10 rounded-full bg-white border border-zinc-100 flex items-center justify-center text-[#86868B] hover:text-blue-500 hover:border-blue-100 transition-all shadow-sm">
              <Mail size={20} />
            </a>
          </div>

          <div className="flex gap-8 text-[13px] font-medium text-[#86868B]">
            <a href="#" className="hover:text-[#1D1D1F] transition-colors">Privacy</a>
            <a href="#" className="hover:text-[#1D1D1F] transition-colors">Terms</a>
            <a href="#" className="hover:text-[#1D1D1F] transition-colors">Accessibility</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
