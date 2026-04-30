import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Waves, Activity, ShieldAlert, Thermometer, 
  Droplet, Settings as SettingsIcon, LayoutDashboard, History,
  LogOut, Zap, Bell, ChevronRight, Power, ShieldCheck,
  Battery, Calendar, Download, Smartphone, Cpu, RefreshCcw,
  HelpCircle, Info, ArrowLeft, X
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { auth, db, logout, handleFirestoreError, pairDevice } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { LogoutConfirmModal } from '../lib/LogoutConfirmModal';
import { 
  doc, onSnapshot, updateDoc, setDoc,
  serverTimestamp, collection, query, where, getDocs, limit,
  orderBy, Timestamp 
} from 'firebase/firestore';




export default function Dashboard() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [device, setDevice] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]); // Current hour chart
  const [allHistory, setAllHistory] = useState<any[]>([]); // All fetched batches
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [pairId, setPairId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [alerts, setAlerts] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);

  // Auth Guard
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  // Handle Pairing — user-centric schema
  const handlePairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !pairId || pairId.trim().length < 4) return;
    setPairing(true);
    try {
      await pairDevice(user.uid, pairId.trim().toUpperCase());
      // userProfile.devices updates via onSnapshot in AuthContext → triggers re-render
    } catch (e: any) {
      if (e.message === 'DEVICE_NOT_FOUND') {
        alert("Device ID not found. Double-check the sticker on your Mal Flow box. The device must be registered before pairing.");
      } else {
        alert(e.message || "Failed to pair device. Check the ID and try again.");
      }
    } finally {
      setPairing(false);
    }
  };

  // Load device — reads deviceId from userProfile.devices[] (user-centric schema)
  useEffect(() => {
    if (!user || !userProfile) return;

    const deviceIds = userProfile.devices || [];
    if (deviceIds.length === 0) {
      setLoading(false);
      return;
    }

    const firstDeviceId = deviceIds[0];
    let unsub: () => void;
    let unsubH: () => void;
    let unsubA: () => void;

    const setupDevice = async () => {
      try {
        const targetRef = doc(db, 'devices', firstDeviceId);

        // Listen to Alerts
        const alertsRef = collection(db, 'devices', firstDeviceId, 'alerts');
        const alertQuery = query(alertsRef, orderBy('timestamp', 'desc'), limit(15));
        unsubA = onSnapshot(alertQuery, (aSnap) => {
          const fetched = aSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setAlerts(fetched);
          setUnreadCount(fetched.filter((a: any) => !a.isRead).length);
        });

        // Listen to device doc
        unsub = onSnapshot(targetRef, (snapshot) => {
          if (snapshot.exists()) {
            setDevice(snapshot.data());
            setLoading(false);
            setError(null);
          } else {
            setError("Device document missing.");
            setLoading(false);
          }
        }, (err) => {
          console.error("Firestore Listen Error:", err);
          setError("Permission denied or database error. Check console.");
          setLoading(false);
        });

        // Listen to History (Last 7 days)
        const historyRef = collection(db, 'devices', firstDeviceId, 'history');
        const hQuery = query(historyRef, orderBy('timestamp', 'desc'), limit(168));
        unsubH = onSnapshot(hQuery, (hSnapshot) => {
          const batches = hSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
          setAllHistory(batches);

          if (!hSnapshot.empty) {
            const lastBatch = batches[0];
            if (lastBatch.readings && Array.isArray(lastBatch.readings)) {
              const realFlowData = lastBatch.readings.map((val: number, idx: number) => ({
                time: `${idx * 5}m`,
                value: val
              }));
              setHistory(realFlowData);
            }
          }
        }, (err) => console.error("History Listen Error:", err));

      } catch (e: any) {
        console.error("Setup Error:", e);
        setError(e.message || "Failed to initialize device.");
        setLoading(false);
      }
    };

    setupDevice();
    return () => {
      if (unsub) unsub();
      if (unsubH) unsubH();
      if (unsubA) unsubA();
    };
  }, [user, userProfile]);

  const markAlertAsRead = async (alertId: string) => {
    if (!device) return;
    try {
      const alertRef = doc(db, 'devices', device.id, 'alerts', alertId);
      await updateDoc(alertRef, { isRead: true });
    } catch (e) {
      console.error(e);
    }
  };

  // Seed Data Helper
  const seedMockData = async () => {
    if (!device || !user) return;
    setSeeding(true);
    try {
      const historyRef = collection(db, 'devices', device.id, 'history');
      const now = new Date();
      
      // Seed last 24 hours
      for (let i = 0; i < 24; i++) {
        const timestamp = new Date(now.getTime() - (i * 60 * 60 * 1000));
        const readings = Array.from({ length: 12 }, () => Math.floor(Math.random() * 8) + 2);
        const avg = readings.reduce((a, b) => a + b, 0) / 12;
        
        await setDoc(doc(historyRef, `seed_${timestamp.getTime()}`), {
          timestamp,
          readings,
          averageFlow: avg,
          batteryVoltage: 3.7 + Math.random() * 0.4,
          temperature: 18 + Math.random() * 5
        });
      }
      alert("Successfully seeded 24 hours of mock data!");
    } catch (e) {
      console.error(e);
      alert("Failed to seed data.");
    } finally {
      setSeeding(false);
    }
  };

  const exportToCSV = async () => {
    if (!device) return;
    setExporting(true);
    try {
      const startTimestamp = Timestamp.fromDate(new Date(dateRange.start));
      const endTimestamp = Timestamp.fromDate(new Date(dateRange.end + 'T23:59:59'));
      
      const historyRef = collection(db, 'devices', device.id, 'history');
      const q = query(
        historyRef, 
        where('timestamp', '>=', startTimestamp),
        where('timestamp', '<=', endTimestamp),
        orderBy('timestamp', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => {
        const d = doc.data();
        const date = d.timestamp?.toDate ? d.timestamp.toDate() : (d.timestamp instanceof Date ? d.timestamp : new Date());
        const totalFlow = d.readings?.reduce((a: number, b: number) => a + b, 0) || 0;
        return {
          timestamp: date.toISOString(),
          totalFlow: totalFlow.toFixed(2),
          averageFlow: d.averageFlow?.toFixed(2),
          batteryVoltage: d.batteryVoltage?.toFixed(2),
          temperature: d.temperature?.toFixed(1)
        };
      });

      if (data.length === 0) {
        alert("No data found for the selected range.");
        return;
      }

      // Generate CSV
      const headers = ["Timestamp", "Total Flow (L)", "Average Flow (L/m)", "Battery (V)", "Temp (C)"];
      const csvContent = [
        headers.join(","),
        ...data.map(row => Object.values(row).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `malflow_data_${dateRange.start}_to_${dateRange.end}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Export Error:", e);
      alert("Failed to export data.");
    } finally {
      setExporting(false);
    }
  };

  // Stats Calculations
  const calculateStats = () => {
    const now = new Date();
    const todayStr = now.toDateString();
    
    let todayUsage = 0;
    let weeklyUsage = 0;
    let todayReadings: number[] = [];
    
    allHistory.forEach((batch: any) => {
      let bDate: Date | null = null;
      if (batch.timestamp?.toDate) {
        bDate = batch.timestamp.toDate();
      } else if (batch.timestamp instanceof Date) {
        bDate = batch.timestamp;
      }
      
      if (!bDate) return;
      
      const batchUsage = batch.readings?.reduce((a: number, b: number) => a + b, 0) || 0;
      
      // Today
      if (bDate.toDateString() === todayStr) {
        todayUsage += batchUsage;
        if (batch.readings) todayReadings.push(...batch.readings);
      }
      
      // Weekly (last 7 days)
      const diffDays = Math.floor((now.getTime() - bDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 7) {
        weeklyUsage += batchUsage;
      }
    });

    const peakToday = todayReadings.length > 0 ? Math.max(...todayReadings) : 0;
    const avgFlow = todayReadings.length > 0 ? (todayReadings.reduce((a,b)=>a+b,0) / todayReadings.length) : 0;
    const lastFlowVal = todayReadings.length > 0 ? todayReadings[todayReadings.length - 1] : 0;
    const lastFlowTime = allHistory.length > 0 && allHistory[0].timestamp?.toDate 
        ? allHistory[0].timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
        : '--:--';

    return {
      today: todayUsage > 0 ? `${todayUsage.toFixed(1)} L` : "0.0 L",
      weekly: weeklyUsage > 0 ? `${weeklyUsage.toLocaleString()} L` : "0 L",
      temp: allHistory.length > 0 ? (allHistory[0] as any).temperature?.toFixed(1) + "°C" : `${device?.temperature?.toFixed(1) || 0}°C`,
      battery: allHistory.length > 0 ? (allHistory[0] as any).batteryVoltage?.toFixed(2) + "V" : `${device?.batteryVoltage?.toFixed(2) || 0}V`,
      peakToday: peakToday.toFixed(2),
      avgFlow: avgFlow.toFixed(2),
      lastFlowVal: lastFlowVal.toFixed(2),
      lastFlowTime
    };
  };

  const stats = calculateStats();

  // --- Computed: device online status and last sync time ---
  const getDeviceStatus = () => {
    if (!device?.lastUpdate) return { label: 'UNKNOWN', color: 'text-zinc-400', dot: 'bg-zinc-400' };
    const lastUpdate: Date = device.lastUpdate?.toDate ? device.lastUpdate.toDate() : new Date(device.lastUpdate);
    const diffMin = Math.floor((Date.now() - lastUpdate.getTime()) / 60000);
    if (diffMin < 90) return { label: 'ONLINE', color: 'text-green-600', dot: 'bg-green-500' };
    if (diffMin < 300) return { label: 'DELAYED', color: 'text-orange-500', dot: 'bg-orange-400' };
    return { label: 'OFFLINE', color: 'text-red-500', dot: 'bg-red-500' };
  };

  const getLastSyncText = () => {
    if (!device?.lastUpdate) return 'Never';
    const lastUpdate: Date = device.lastUpdate?.toDate ? device.lastUpdate.toDate() : new Date(device.lastUpdate);
    const diffMin = Math.floor((Date.now() - lastUpdate.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return lastUpdate.toLocaleDateString();
  };

  const getSensorStatus = () => {
    if (!device?.lastUpdate) return { label: 'Unknown', color: 'text-zinc-400' };
    const lastUpdate: Date = device.lastUpdate?.toDate ? device.lastUpdate.toDate() : new Date(device.lastUpdate);
    const diffMin = Math.floor((Date.now() - lastUpdate.getTime()) / 60000);
    if (diffMin < 90) return { label: 'Active', color: 'text-green-600' };
    return { label: 'Inactive', color: 'text-orange-500' };
  };

  const deviceStatus = getDeviceStatus();
  const lastSyncText = getLastSyncText();
  const sensorStatus = getSensorStatus();

  const dailyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    const usage = allHistory.filter(b => {
       const bDate = b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp instanceof Date ? b.timestamp : null);
       return bDate && bDate.toDateString() === d.toDateString();
    }).reduce((acc, b) => acc + (b.readings?.reduce((a:number,c:number)=>a+c, 0) || 0), 0);
    return { day: dayName, usage };
  });

  const weeklyData = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, index) => {
    const usage = allHistory.filter(b => {
       const bDate = b.timestamp?.toDate ? b.timestamp.toDate() : (b.timestamp instanceof Date ? b.timestamp : null);
       return bDate && bDate.getFullYear() === new Date().getFullYear() && bDate.getMonth() === index;
    }).reduce((acc, b) => acc + (b.readings?.reduce((a:number,c:number)=>a+c, 0) || 0), 0);
    return { month: m, usage };
  });
  if (authLoading || loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FBFBFD]">
        <div className="flex flex-col items-center gap-4 text-center px-6">
          <motion.div 
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"
          />
          <div className="space-y-1">
            <p className="text-[#1D1D1F] font-bold text-lg">Syncing Mal Flow...</p>
            <p className="text-zinc-400 text-sm">Connecting to your ESP32 module</p>
          </div>
        </div>
      </div>
    );
  }

  // Pairing State
  if (!device) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#FBFBFD] px-6">
        <header className="fixed top-0 left-0 right-0 p-6 flex justify-between items-center bg-white/50 backdrop-blur-xl border-b border-[#E5E5E7] md:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
              <Waves className="text-white" size={16} />
            </div>
            <span className="font-bold tracking-tight">Mal Flow</span>
          </div>
          <button onClick={() => setShowLogoutConfirm(true)} className="text-[#86868B]"><LogOut size={20} /></button>
        </header>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="apple-card p-8 md:p-12 max-w-lg w-full relative overflow-hidden"
        >
          <AnimatePresence mode="wait">
            {!showHelp ? (
              <motion.div 
                key="main"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-[28px] flex items-center justify-center mx-auto mb-8 shadow-inner shadow-blue-500/10">
                  <Smartphone size={40} strokeWidth={1.5} />
                </div>
                
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-center mb-2">Connect Device</h1>
                <p className="text-[#86868B] text-center text-sm md:text-base font-medium mb-10 px-4">
                  Enter the Device ID found on your module sticker or shown in the app setup guide.
                </p>

                <form onSubmit={handlePairing} className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-end ml-1">
                      <label className="text-[10px] uppercase font-bold text-[#86868B] tracking-wider">Device ID</label>
                      <button 
                        type="button" 
                        onClick={() => setShowHelp(true)}
                        className="text-[10px] font-bold text-blue-500 hover:underline"
                      >
                        Where to find it?
                      </button>
                    </div>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors">
                        <Cpu size={20} />
                      </div>
                      <input 
                        type="text" 
                        value={pairId}
                        onChange={(e) => setPairId(e.target.value.toUpperCase())}
                        placeholder="e.g. Surname_Valve_XX"
                        className="w-full pl-14 pr-6 py-5 bg-[#F5F5F7] border-2 border-transparent rounded-[24px] focus:bg-white focus:border-blue-500 transition-all font-bold tracking-wider outline-none"
                        required
                      />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    disabled={pairing || !pairId}
                    className="w-full py-5 bg-[#1D1D1F] text-white rounded-[24px] font-bold text-lg shadow-xl shadow-zinc-200 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3 overflow-hidden relative"
                  >
                    <AnimatePresence mode="wait">
                      {pairing ? (
                        <motion.div 
                          key="loading"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <RefreshCcw className="animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.div 
                          key="ready"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="flex items-center gap-3"
                        >
                          <span>Pair Device</span>
                          <ChevronRight size={20} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div 
                key="help"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 mb-6">
                   <button 
                     onClick={() => setShowHelp(false)}
                     className="p-2 hover:bg-[#F5F5F7] rounded-full transition-colors"
                   >
                     <ArrowLeft size={20} className="text-[#1D1D1F]" />
                   </button>
                   <h2 className="text-xl font-bold tracking-tight">How to find your ID</h2>
                </div>

                <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-2 scrollbar-hide">
                  <div className="space-y-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-blue-500">
                      <Info size={16} />
                      Check the Module
                    </h3>
                    <p className="text-sm text-[#86868B] leading-relaxed">
                      Look for a small white sticker on your Mal Flow box. It usually contains a 2-digit code.
                    </p>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100">
                    <p className="text-[12px] text-blue-700 font-medium leading-relaxed">
                      <strong>Pro Tip:</strong> Device IDs look like <code className="bg-white/50 px-1">Surname_Valve_01</code>. You'll find it on the sticker on your device or in the setup guide.
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => setShowHelp(false)}
                  className="w-full py-4 bg-[#F5F5F7] text-[#1D1D1F] rounded-[20px] font-bold text-sm hover:bg-[#E5E5E7] transition-all"
                >
                  Got it!
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-12 pt-8 border-t border-[#F5F5F7] flex flex-col items-center gap-4">
             <div className="flex items-center gap-2 text-xs font-bold text-blue-500 bg-blue-50 px-4 py-2 rounded-full">
               <ShieldCheck size={14} />
               <span>Authenticated as {user?.email}</span>
             </div>
             <button 
               onClick={() => setShowLogoutConfirm(true)}
               className="text-[11px] font-bold text-zinc-400 hover:text-zinc-600 transition-colors uppercase tracking-widest"
             >
               Switch Account
             </button>
          </div>
        </motion.div>

        <LogoutConfirmModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FBFBFD] px-6">
        <div className="apple-card p-10 max-w-md w-full text-center border-red-100 bg-red-50/30">
          <div className="w-16 h-16 bg-red-100 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-xl font-bold mb-2">Sync Error</h2>
          <p className="text-sm text-red-600 mb-8 font-medium">{error || "Something went wrong"}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-[#1D1D1F] text-white rounded-full font-bold shadow-lg active:scale-95 transition-transform"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const getBatteryColor = (voltage: number) => {
    if (voltage > 3.9) return "text-green-500";
    if (voltage > 3.4) return "text-orange-500";
    return "text-red-500";
  };
return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FBFBFD] text-[#1D1D1F] overflow-hidden font-sans md:pb-0">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-72 bg-white/50 backdrop-blur-2xl border-r border-[#E5E5E7] flex-col items-center py-10 px-6">
        <Link to="/" className="flex items-center gap-3 mb-16 w-full px-2 active:scale-95 transition-transform">
          <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Waves className="text-white" size={24} />
          </div>
          <span className="text-2xl font-bold tracking-tight">Mal Flow</span>
        </Link>

        <nav className="flex-1 w-full space-y-2">
          <NavItem icon={LayoutDashboard} label="Overview" active onClick={() => navigate('/dashboard')} />
          <NavItem 
            icon={Bell} 
            label="Notifications" 
            onClick={() => setShowNotifications(true)} 
            badge={unreadCount > 0 ? unreadCount : undefined}
          />
          <NavItem icon={SettingsIcon} label="Settings" onClick={() => navigate('/settings')} />
        </nav>

        <div className="w-full pt-8 border-t border-[#E5E5E7] mt-auto">
          <NavItem icon={LogOut} label="Log Out" onClick={() => setShowLogoutConfirm(true)} />
        </div>
      </aside>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden h-24 pb-4 bg-white/80 backdrop-blur-xl border-t border-[#E5E5E7] flex items-center justify-around px-2">
        <MobileNavItem icon={LayoutDashboard} active onClick={() => navigate('/dashboard')} />
        <div className="relative">
          <MobileNavItem icon={Bell} onClick={() => setShowNotifications(true)} />
          {unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {unreadCount}
            </span>
          )}
        </div>
        <MobileNavItem icon={SettingsIcon} onClick={() => navigate('/settings')} />
        <button onClick={() => setShowLogoutConfirm(true)} className="p-3 text-[#86868B]"><LogOut size={24} /></button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10 pb-40 md:pb-10 space-y-6 md:space-y-10 relative">
        <LogoutConfirmModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />
        
        {/* Notifications Slide-over */}
        <AnimatePresence>
          {showNotifications && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowNotifications(false)}
                className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[100]"
              />
              <motion.div 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed top-0 right-0 h-full w-full max-w-[400px] bg-white shadow-2xl z-[101] flex flex-col pt-safe"
              >
                <div className="p-8 border-b border-[#F5F5F7] flex justify-between items-center bg-[#FBFBFD]">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight">Notifications</h2>
                    <p className="text-xs text-[#86868B] font-bold uppercase tracking-widest mt-1">
                      {unreadCount} Unread Alerts
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowNotifications(false)}
                    className="p-3 bg-[#F5F5F7] rounded-full hover:bg-[#E5E5E7] transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                  {alerts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50 grayscale">
                      <Bell size={48} className="mb-4" />
                      <p className="text-sm font-bold">No notifications yet</p>
                    </div>
                  ) : (
                    alerts.map(alert => (
                      <motion.div 
                        key={alert.id}
                        layout
                        onClick={() => markAlertAsRead(alert.id)}
                        className={cn(
                          "p-6 rounded-[24px] transition-all cursor-pointer border-2",
                          alert.isRead 
                            ? "bg-white border-[#F5F5F7] opacity-60" 
                            : "bg-blue-50/50 border-blue-500/20 shadow-lg shadow-blue-500/5"
                        )}
                      >
                        <div className="flex gap-4">
                          <div className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner",
                            alert.type === 'leak' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                          )}>
                            {alert.type === 'leak' ? <ShieldAlert size={20} /> : <Zap size={20} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <span className={cn(
                                "text-[10px] font-black uppercase tracking-widest",
                                alert.severity === 'critical' ? 'text-red-500' : 'text-blue-500'
                              )}>
                                {alert.type} • {alert.severity}
                              </span>
                              <span className="text-[10px] font-bold text-[#86868B]">
                                {alert.timestamp?.toDate ? alert.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                              </span>
                            </div>
                            <p className="text-sm font-bold leading-snug text-[#1D1D1F] break-words">{alert.message}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Simple Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="md:hidden w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 active:scale-90 transition-transform">
              <Waves className="text-white" size={20} />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{user?.displayName?.split(' ')[0]}'s Dashboard</h1>
              <p className="text-sm text-[#86868B] font-medium">Data updated every hour from ESP32.</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 md:gap-4 relative">
            {/* Profile badge removed as per user request */}
          </div>
        </header>

        {/* Global Stats */}
        <div className="flex overflow-x-auto md:grid md:grid-cols-4 gap-4 md:gap-8 pb-4 md:pb-0 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
           <div className="min-w-[200px] md:min-w-0 flex-1"><StatCard icon={Droplet} label="Today" value={stats.today} color="blue" /></div>
           <div className="min-w-[200px] md:min-w-0 flex-1"><StatCard icon={Thermometer} label="Water Temp" value={stats.temp} color="yellow" /></div>
           <div className="min-w-[200px] md:min-w-0 flex-1"><StatCard icon={Battery} label="Battery" value={stats.battery} color={(() => { const v = parseFloat(stats.battery) || device?.batteryVoltage || 0; return v > 3.9 ? 'green' : v > 3.4 ? 'orange' : 'red'; })()} /></div>
           {/* Battery stays here, removed from System Status card */}
           <div className="min-w-[200px] md:min-w-0 flex-1"><StatCard icon={Calendar} label="Weekly Total" value={stats.weekly} color="blue" /></div>
        </div>
        {/* Major Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-2 flex flex-col gap-6 md:gap-8">
            <div className="apple-card relative p-6 md:p-8">
               <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-tight">Flow Consumption</h2>
                    <div className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider">{view} summary</div>
                  </div>
                  <div className="flex gap-1 p-1 bg-[#F5F5F7] rounded-xl border border-[#E5E5E7] self-start md:self-auto">
                    <button 
                      onClick={() => setView('daily')}
                      className={cn("px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all", view === 'daily' ? "bg-white shadow-sm" : "text-[#86868B]")}
                    >
                      Daily
                    </button>
                    <button 
                      onClick={() => setView('weekly')}
                      className={cn("px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all", view === 'weekly' ? "bg-white shadow-sm" : "text-[#86868B]")}
                    >
                      Weekly
                    </button>
                    <button 
                      onClick={() => setView('monthly')}
                      className={cn("px-4 py-1.5 text-[11px] font-bold rounded-lg transition-all", view === 'monthly' ? "bg-white shadow-sm" : "text-[#86868B]")}
                    >
                      Monthly
                    </button>
                  </div>
               </div>

               {(() => {
                 const lastBatch = allHistory[0];
                 const lastBatchDate: Date | null = lastBatch?.timestamp?.toDate
                   ? lastBatch.timestamp.toDate()
                   : lastBatch?.timestamp instanceof Date ? lastBatch.timestamp : null;
                 const isRecent = lastBatchDate && (Date.now() - lastBatchDate.getTime()) < 24 * 60 * 60 * 1000;
                 const hasData = history.length > 0 && isRecent;

                 if (view === 'daily' && !hasData) {
                   return (
                     <div className="h-[250px] w-full flex flex-col items-center justify-center gap-3 text-center">
                       <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] flex items-center justify-center">
                         <Waves size={22} className="text-[#C7C7CC]" />
                       </div>
                       <p className="text-sm font-bold text-[#86868B]">No data streamed in the last 24 hours</p>
                       <p className="text-[11px] text-[#C7C7CC] font-medium">The ESP32 uploads a new batch every hour.</p>
                     </div>
                   );
                 }

                 return (
               <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {view === 'daily' ? (
                      <AreaChart data={history}>
                        <defs>
                          <linearGradient id="colorFlux" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis hide />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px' }}
                        />
                        <Area type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorFlux)" />
                      </AreaChart>
                    ) : view === 'weekly' ? (
                      <BarChart data={dailyData}>
                        <Tooltip 
                          cursor={{fill: '#F5F5F7'}}
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px' }}
                        />
                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#86868B'}} />
                        <Bar dataKey="usage" radius={[6, 6, 0, 0]} barSize={24}>
                          {dailyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === dailyData.length - 1 ? '#3B82F6' : '#E5E5E7'} />
                          ))}
                        </Bar>
                      </BarChart>
                    ) : (
                      <BarChart data={weeklyData}>
                        <Tooltip 
                          cursor={{fill: '#F5F5F7'}}
                          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(10px)', border: 'none', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontSize: '10px' }}
                        />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#86868B'}} />
                        <Bar dataKey="usage" radius={[6, 6, 0, 0]} barSize={24}>
                          {weeklyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={index === weeklyData.length - 1 ? '#3B82F6' : '#E5E5E7'} />
                          ))}
                        </Bar>
                      </BarChart>
                    )}
                  </ResponsiveContainer>
               </div>
                 );
               })()}
               
               <div className="mt-8 grid grid-cols-2 gap-4">
                  <div className="p-4 bg-[#F5F5F7] rounded-2xl">
                    <div className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider mb-1">Average Flow</div>
                    <div className="text-xl font-bold">{stats.avgFlow} L/m</div>
                  </div>
                  <div className="p-4 bg-[#F5F5F7] rounded-2xl">
                    <div className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider mb-1">Peak Today</div>
                    <div className="text-xl font-bold">{stats.peakToday} L/m</div>
                  </div>
               </div>
            </div>

            {/* Export Data moved here to fill space */}
            <div className="apple-card p-6 md:p-8">
                <div className="flex items-center justify-between mb-4">
                   <h3 className="text-lg font-bold tracking-tight">Export History</h3>
                   <Download size={18} className="text-blue-500" />
                </div>
                <p className="text-xs text-[#86868B] mb-6 font-medium">Download your consumption data in CSV format for offline analysis.</p>
                <div className="space-y-4">
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] uppercase tracking-wider font-bold text-[#86868B]">Start Date</label>
                         <input 
                           type="date" 
                           value={dateRange.start}
                           onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                           className="w-full bg-[#F5F5F7] border-none rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                         />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[10px] uppercase tracking-wider font-bold text-[#86868B]">End Date</label>
                         <input 
                           type="date" 
                           value={dateRange.end}
                           onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                           className="w-full bg-[#F5F5F7] border-none rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                         />
                      </div>
                   </div>
                   <button 
                     onClick={exportToCSV}
                     disabled={exporting}
                     className="w-full py-4 bg-blue-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 hover:bg-blue-600 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                   >
                     {exporting ? (
                       <motion.div 
                         animate={{ rotate: 360 }}
                         transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                         className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                       />
                     ) : (
                       <Download size={16} />
                     )}
                     {exporting ? 'Generating CSV...' : 'Download Full Report'}
                   </button>
                </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 md:gap-8">
             <div className="apple-card p-6 flex flex-col">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-lg font-bold tracking-tight">System Status</h3>
                </div>
                
                <div className="space-y-4">
                   {/* System Status row */}
                   <div className="flex items-center justify-between p-3 bg-[#F5F5F7] rounded-xl">
                      <div className="flex items-center gap-3">
                         <Power size={18} className="text-[#86868B]" />
                         <span className="text-sm font-semibold">System Status</span>
                         <div className="relative group/tip">
                           <Info size={13} className="text-[#C7C7CC] cursor-help" />
                           <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 bg-[#1D1D1F] text-white text-[10px] font-medium rounded-xl px-3 py-2 leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                             🟢 <b>Online</b> — last sync &lt; 90 min ago<br/>
                             🟠 <b>Delayed</b> — last sync 90–300 min ago<br/>
                             🔴 <b>Offline</b> — no data for over 5 hours
                             <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#1D1D1F]" />
                           </div>
                         </div>
                      </div>
                      <span className={`text-sm font-bold ${deviceStatus.color}`}>{deviceStatus.label}</span>
                   </div>
                   {/* Sensor Status row */}
                   <div className="flex items-center justify-between p-3 bg-[#F5F5F7] rounded-xl">
                      <div className="flex items-center gap-3">
                         <Waves size={18} className="text-[#86868B]" />
                         <span className="text-sm font-semibold">Sensor Status</span>
                         <div className="relative group/tip2">
                           <Info size={13} className="text-[#C7C7CC] cursor-help" />
                           <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 bg-[#1D1D1F] text-white text-[10px] font-medium rounded-xl px-3 py-2 leading-relaxed opacity-0 group-hover/tip2:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                             ✅ <b>Active</b> — flow sensor sending data normally<br/>
                             ⚠️ <b>Inactive</b> — no readings received in the last 90 min
                             <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#1D1D1F]" />
                           </div>
                         </div>
                      </div>
                      <span className={`text-sm font-bold ${sensorStatus.color}`}>{sensorStatus.label}</span>
                   </div>
                   {/* Last Sync row */}
                   <div className="flex items-center justify-between p-3 bg-[#F5F5F7] rounded-xl">
                      <div className="flex items-center gap-3">
                         <Calendar size={18} className="text-[#86868B]" />
                         <span className="text-sm font-semibold">Last Sync</span>
                      </div>
                      <span className="text-sm font-bold">{lastSyncText}</span>
                   </div>
                </div>

                <p className="mt-6 text-[11px] text-[#86868B] text-center leading-relaxed font-medium">
                  The ESP32 module is broadcasting consumption data every hour. No remote control available for valve operations.
                </p>
             </div>

             <div className="apple-card p-6 flex-1 bg-white relative overflow-hidden group">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-lg font-bold tracking-tight">Recent Activity</h3>
                   <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold", unreadCount > 0 ? "bg-blue-100 text-blue-600" : "bg-zinc-100 text-zinc-500")}>
                     {unreadCount > 0 ? `${unreadCount} NEW` : 'SYNCED'}
                   </span>
                </div>
                <div className="space-y-5">
                   {alerts.length === 0 ? (
                     <div className="h-full flex flex-col items-center justify-center text-center opacity-40 grayscale py-12">
                       <RefreshCcw size={40} className="mb-4 animate-spin-slow text-[#86868B]" />
                       <p className="text-sm font-bold italic tracking-tight text-[#86868B]">All systems nominal.</p>
                     </div>
                   ) : (
                     alerts.slice(0, 4).map(alert => (
                       <div key={alert.id} className="flex gap-4 group/item cursor-pointer" onClick={() => setShowNotifications(true)}>
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all",
                            alert.type === 'leak' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'
                          )}>
                            {alert.type === 'leak' ? <ShieldAlert size={16} /> : <Zap size={16} />}
                          </div>
                          <div className="flex-1 min-w-0">
                             <p className={cn("text-[13px] font-bold leading-snug mb-0.5 truncate transition-colors", alert.isRead ? "text-zinc-400" : "text-[#1D1D1F] group-hover/item:text-blue-500")}>
                               {alert.message}
                             </p>
                             <span className="text-[10px] text-[#86868B] font-bold uppercase tracking-widest">
                                {alert.timestamp?.toDate ? alert.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                             </span>
                          </div>
                          <ChevronRight size={14} className="text-[#E5E5E7] group-hover/item:text-blue-500 group-hover/item:translate-x-1 transition-all self-center" />
                       </div>
                     ))
                   )}
                </div>
                <div className="mt-8 pt-6 border-t border-[#F5F5F7]">
                  <button 
                    onClick={() => setShowNotifications(true)}
                    className="w-full py-3 text-xs font-black text-blue-500 uppercase tracking-[0.2em] hover:bg-blue-50 rounded-xl transition-all active:scale-95"
                  >
                    View All history
                  </button>
                </div>
             </div>
          </div>
        </div>


      </main>
    </div>
  );
}

function MobileNavItem({ icon: Icon, active = false, onClick }: { icon: any, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "p-3 rounded-2xl transition-all",
        active ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "text-[#86868B]"
      )}
    >
      <Icon size={24} />
    </button>
  );
}

function NavItem({ icon: Icon, label, active = false, onClick, badge }: { icon: any, label: string, active?: boolean, onClick?: () => void, badge?: number }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-5 px-6 py-4 rounded-2xl transition-all font-semibold relative",
        active 
          ? "bg-blue-500 text-white shadow-xl shadow-blue-500/20" 
          : "text-[#86868B] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
      )}
    >
      <div className="relative">
        <Icon size={24} />
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className="hidden md:block text-[15px]">{label}</span>
      {active && <div className="hidden md:block ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-sm" />}
    </button>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any, label: string, value: string, color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-500",
    orange: "bg-orange-50 text-orange-500",
    yellow: "bg-yellow-50 text-yellow-500",
    green: "bg-green-50 text-green-500",
    red: "bg-red-50 text-red-500",
  };

  return (
    <div className="apple-card p-8 hover:transform hover:scale-[1.02] transition-all cursor-default">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-sm", colorMap[color])}>
        <Icon size={24} />
      </div>
      <div>
        <div className="text-[#86868B] text-[13px] font-semibold mb-1 uppercase tracking-tight">{label}</div>
        <div className="text-3xl font-bold tracking-tight">{value}</div>
      </div>
    </div>
  );
}

function DetailTile({ title, value, sub, icon: Icon }: { title: string, value: string, sub: string, icon: any }) {
  return (
    <div className="apple-card p-8">
      <div className="flex items-center gap-3 mb-6">
        <Icon size={16} className="text-[#86868B]" />
        <span className="text-[#86868B] text-[12px] font-bold uppercase tracking-widest">{title}</span>
      </div>
      <div className="text-3xl font-bold mb-1 tracking-tight">{value}</div>
      <div className="text-[12px] text-[#86868B] font-medium">{sub}</div>
    </div>
  );
}