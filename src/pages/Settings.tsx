import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Waves, ShieldAlert, Settings as SettingsIcon, LayoutDashboard,
  LogOut, Bell, ShieldCheck, Battery, Cpu, Smartphone, RefreshCcw, Save,
  Users, UserPlus, Trash2, Mail, Droplet, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';
import { auth, db, logout, DeviceData, MemberProfile, sharDeviceWithMember, removeMember, getMembers, unpairDevice } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { LogoutConfirmModal } from '../lib/LogoutConfirmModal';
import {
  doc, onSnapshot, updateDoc, getDoc, collection, getDocs, deleteDoc
} from 'firebase/firestore';

export default function Settings() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [device, setDevice] = useState<DeviceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The current user is "owner" if this device was paired by them directly.
  // Since there's no ownerId on the device, we check if they were the first
  // to pair (claimedAt exists and they added it). For simplicity we treat
  // every user who has the device as potentially sharing — but only the first
  // user in the members list (role=owner) can manage members.
  // We track this via /users/{uid}/members — if you have a members subcollection
  // you are the owner.
  const [isOwner, setIsOwner] = useState(false);

  // Sharing
  const [inviteEmail, setInviteEmail] = useState('');
  const [sharing, setSharing] = useState(false);
  const [members, setMembers] = useState<MemberProfile[]>([]);

  // Form
  const [deviceName, setDeviceName] = useState('');
  const [monitorSettings, setMonitorSettings] = useState({
    notificationsEnabled: true,
    emailAlerts: true,
    dailyThreshold: 1000,
    leakThreshold: 1.0,
    nightStart: "00:00",
    nightEnd: "06:00"
  });

  // ── Guards ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [user, authLoading, navigate]);

  // ── Load device & members ──────────────────────────────────────────────────
  useEffect(() => {
    if (!user || !userProfile) return;

    const deviceIds = userProfile.devices || [];
    if (deviceIds.length === 0) {
      setLoading(false);
      return;
    }

    // Load first device (single-device view for now; multi-device selector can be added later)
    const firstDeviceId = deviceIds[0];
    const deviceRef = doc(db, 'devices', firstDeviceId);

    const unsub = onSnapshot(deviceRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data() as DeviceData;
        setDevice(data);
        setDeviceName(data.name || '');
        if (data.settings) {
          setMonitorSettings(prev => ({ ...prev, ...data.settings }));
        }
      }
      setLoading(false);
    });

    // Check if current user is owner (has a members subcollection)
    const checkOwner = async () => {
      const membersSnap = await getDocs(collection(db, 'users', user.uid, 'members'));
      setIsOwner(!membersSnap.empty || (userProfile.devices?.length > 0));
      // Simplified: owner = first person who paired. 
      // A cleaner approach: store role in /users/{uid} doc.
      // For now, anyone who has the device and has a members subcollection is owner.
    };

    // Load family members
    const loadMembers = async () => {
      const fetched = await getMembers(user.uid);
      setMembers(fetched);
      if (fetched.length > 0) setIsOwner(true);
    };

    checkOwner();
    loadMembers();

    return () => unsub();
  }, [user, userProfile]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!device) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'devices', device.id), {
        name: deviceName,
        settings: monitorSettings
      });
      alert("Settings saved successfully!");
    } catch (e) {
      console.error(e);
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device || !inviteEmail || !user) return;
    setSharing(true);
    try {
      await sharDeviceWithMember(user.uid, device.id, inviteEmail.trim().toLowerCase());
      setInviteEmail('');
      // Refresh members
      const fetched = await getMembers(user.uid);
      setMembers(fetched);
      alert("Family member added successfully!");
    } catch (e: any) {
      if (e.message === 'USER_NOT_FOUND') {
        alert("This email isn't registered in Mal Flow yet. Ask them to create an account first.");
      } else if (e.message === 'CANNOT_ADD_YOURSELF') {
        alert("You can't add yourself as a member.");
      } else {
        alert("Failed to share access. Please try again.");
      }
    } finally {
      setSharing(false);
    }
  };

  const handleRemoveMember = async (memberUid: string) => {
    if (!user || !userProfile) return;
    if (!confirm("Remove this member's access?")) return;
    try {
      await removeMember(user.uid, memberUid, userProfile.devices || []);
      // Also delete the member subdoc
      await deleteDoc(doc(db, 'users', user.uid, 'members', memberUid));
      const fetched = await getMembers(user.uid);
      setMembers(fetched);
      alert("Member removed.");
    } catch (e) {
      console.error(e);
      alert("Failed to remove member.");
    }
  };

  const handleUnpairDevice = async () => {
    if (!device || !user) return;
    if (!confirm("Are you sure you want to unpair this device? You'll lose access to its data until you re-pair it.")) return;
    try {
      await unpairDevice(user.uid, device.id);
      navigate('/dashboard');
    } catch (e) {
      console.error(e);
      alert("Failed to unpair device.");
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!confirm("CRITICAL: This will permanently delete your account. This cannot be undone. Continue?")) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      await user.delete();
      navigate('/');
    } catch (e: any) {
      if (e.code === 'auth/requires-recent-login') {
        alert("For security, please log out and log back in before deleting your account.");
      } else {
        alert("Failed to delete account.");
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (authLoading || loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FBFBFD]">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#FBFBFD] text-[#1D1D1F] overflow-hidden font-sans md:pb-0">
      <LogoutConfirmModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} />

      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-72 bg-white/50 backdrop-blur-2xl border-r border-[#E5E5E7] flex-col items-center py-10 px-6">
        <div className="flex items-center gap-3 mb-16 w-full px-2">
          <div className="w-12 h-12 bg-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Waves className="text-white" size={24} />
          </div>
          <span className="text-2xl font-bold tracking-tight">Mal Flow</span>
        </div>
        <nav className="flex-1 w-full space-y-2">
          <NavItem icon={LayoutDashboard} label="Overview" onClick={() => navigate('/dashboard')} />
          <NavItem icon={Bell} label="Notifications" onClick={() => navigate('/dashboard')} />
          <NavItem icon={SettingsIcon} label="Settings" active />
        </nav>
        <div className="w-full pt-8 border-t border-[#E5E5E7] mt-auto">
          <NavItem icon={LogOut} label="Log Out" onClick={() => setShowLogoutConfirm(true)} />
        </div>
      </aside>

      {/* Bottom Nav - Mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden h-24 pb-4 bg-white/80 backdrop-blur-xl border-t border-[#E5E5E7] flex items-center justify-around px-2">
        <MobileNavItem icon={LayoutDashboard} onClick={() => navigate('/dashboard')} />
        <MobileNavItem icon={Bell} onClick={() => navigate('/dashboard')} />
        <MobileNavItem icon={SettingsIcon} active />
        <button onClick={() => setShowLogoutConfirm(true)} className="p-3 text-[#86868B]"><LogOut size={24} /></button>
      </nav>

      <main className="flex-1 overflow-y-auto p-4 md:p-10 pb-40 md:pb-10 space-y-6 md:space-y-8">
        <header className="mb-2">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-[#86868B] font-medium mt-1">Manage your device, family access, and alerts.</p>
        </header>

        {!device ? (
          <div className="apple-card p-10 text-center">
            <Smartphone size={40} className="mx-auto mb-4 text-[#C7C7CC]" />
            <p className="font-bold text-[#86868B]">No device paired yet.</p>
            <button onClick={() => navigate('/dashboard')} className="mt-4 px-6 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm">
              Go to Dashboard to pair
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">

            {/* ── Device Name ── */}
            <div className="apple-card p-6 md:p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Droplet size={20} className="text-blue-500" />
                Device Name
              </h2>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Valvola Ingresso"
                className="w-full px-4 py-3 bg-[#F5F5F7] border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-semibold mb-4"
              />
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {/* ── Family Members ── */}
            <div className="apple-card p-6 md:p-8">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Users size={20} className="text-blue-500" />
                Family Access
              </h2>

              {isOwner ? (
                <>
                  <form onSubmit={handleShare} className="flex gap-2 mb-6">
                    <div className="flex-1 relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="member@email.com"
                        className="w-full pl-9 pr-4 py-3 bg-[#F5F5F7] border-none rounded-xl focus:ring-2 focus:ring-blue-500 transition-all font-semibold text-sm"
                        required
                      />
                    </div>
                    <button type="submit" disabled={sharing}
                      className="px-4 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1.5">
                      {sharing ? <RefreshCcw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      Add
                    </button>
                  </form>

                  {members.length === 0 ? (
                    <p className="text-sm text-[#86868B] italic text-center py-4">No family members added yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {members.map(member => (
                        <div key={member.uid} className="flex items-center justify-between p-3 bg-[#F5F5F7] rounded-xl">
                          <div>
                            <p className="text-sm font-bold">{member.displayName || member.email}</p>
                            <p className="text-[11px] text-[#86868B]">{member.email} · {member.role}</p>
                          </div>
                          <button onClick={() => handleRemoveMember(member.uid)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 text-sm text-blue-600 italic">
                  Only the device owner can manage family members.
                </div>
              )}
            </div>

            {/* ── Proactive Monitoring ── */}
            <div className="apple-card p-6 md:p-8 lg:col-span-2">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Bell size={20} className="text-orange-500" />
                Proactive Monitoring
              </h2>
              <div className="space-y-6">
                <PreferenceToggle
                  label="Enable Notifications"
                  description="Receive real-time alerts for leaks and high usage."
                  active={monitorSettings.notificationsEnabled}
                  onToggle={() => setMonitorSettings(p => ({ ...p, notificationsEnabled: !p.notificationsEnabled }))}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-[#86868B] tracking-wider ml-1">Daily Limit (L)</label>
                    <input type="number" value={monitorSettings.dailyThreshold}
                      onChange={(e) => setMonitorSettings(p => ({ ...p, dailyThreshold: Number(e.target.value) }))}
                      className="w-full px-4 py-3 bg-[#F5F5F7] border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-[#86868B] tracking-wider ml-1">Leak Threshold (L/min)</label>
                    <input type="number" step="0.1" value={monitorSettings.leakThreshold}
                      onChange={(e) => setMonitorSettings(p => ({ ...p, leakThreshold: Number(e.target.value) }))}
                      className="w-full px-4 py-3 bg-[#F5F5F7] border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-[#86868B] tracking-wider ml-1">Night Start</label>
                    <input type="time" value={monitorSettings.nightStart}
                      onChange={(e) => setMonitorSettings(p => ({ ...p, nightStart: e.target.value }))}
                      className="w-full px-4 py-3 bg-[#F5F5F7] border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-[#86868B] tracking-wider ml-1">Night End</label>
                    <input type="time" value={monitorSettings.nightEnd}
                      onChange={(e) => setMonitorSettings(p => ({ ...p, nightEnd: e.target.value }))}
                      className="w-full px-4 py-3 bg-[#F5F5F7] border-none rounded-xl focus:ring-2 focus:ring-blue-500 font-semibold" />
                  </div>
                </div>
                <PreferenceToggle
                  label="Email Alerts"
                  description="Send critical alerts to my email address."
                  active={monitorSettings.emailAlerts}
                  onToggle={() => setMonitorSettings(p => ({ ...p, emailAlerts: !p.emailAlerts }))}
                />
                <button onClick={handleSave} disabled={saving}
                  className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <RefreshCcw size={16} className="animate-spin" /> : <Save size={16} />}
                  {saving ? 'Saving...' : 'Save Monitoring Settings'}
                </button>
              </div>
            </div>

            {/* ── Hardware Info ── */}
            <div className="apple-card p-6 md:p-8 bg-zinc-900 text-white border-none">
              <h2 className="text-xl font-bold mb-8 flex items-center gap-2">
                <ShieldCheck size={20} className="text-blue-400" />
                Hardware Information
              </h2>
              <div className="space-y-6">
                <InfoRow label="Model" value="ESP32-WROOM-32" icon={Cpu} />
                <InfoRow label="Firmware" value="v1.4.0-stable" icon={RefreshCcw} />
                <InfoRow label="Device ID" value={device?.id || 'N/A'} icon={ShieldCheck} />
                <InfoRow label="Paired since" value={
                  device?.claimedAt?.toDate
                    ? device.claimedAt.toDate().toLocaleDateString()
                    : 'Unknown'
                } icon={Bell} />
              </div>
            </div>

            {/* ── Danger Zone ── */}
            <div className="apple-card p-6 md:p-8 border-red-50 bg-red-50/20">
              <h2 className="text-lg font-bold text-red-600 mb-2">Danger Zone</h2>
              <p className="text-sm text-zinc-500 mb-6">Irreversible actions affecting your device and account.</p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button onClick={handleUnpairDevice}
                  className="flex-1 px-6 py-3 bg-white border border-red-200 text-red-500 rounded-xl font-bold text-sm hover:bg-red-50 transition-colors">
                  Unpair Device
                </button>
                <button onClick={handleDeleteAccount}
                  className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-colors shadow-lg shadow-red-500/10">
                  Delete My Account
                </button>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value, icon: Icon }: { label: string, value: string, icon: any }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-0.5">{label}</div>
        <div className="text-sm font-bold">{value}</div>
      </div>
    </div>
  );
}

function PreferenceToggle({ label, description, active, onToggle }: { label: string, description: string, active: boolean, onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 bg-[#F5F5F7] rounded-2xl hover:bg-white hover:shadow-sm transition-all duration-300">
      <div className="flex-1 mr-4">
        <div className="text-sm font-bold mb-0.5">{label}</div>
        <p className="text-[11px] text-[#86868B] leading-tight">{description}</p>
      </div>
      <button onClick={onToggle}
        className={cn("w-12 h-6 rounded-full relative transition-all duration-300", active ? "bg-blue-500" : "bg-zinc-300")}>
        <motion.div animate={{ x: active ? 24 : 4 }} className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
      </button>
    </div>
  );
}

function MobileNavItem({ icon: Icon, active = false, onClick }: { icon: any, active?: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("p-3 rounded-2xl transition-all", active ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "text-[#86868B]")}>
      <Icon size={24} />
    </button>
  );
}

function NavItem({ icon: Icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("w-full flex items-center gap-5 px-6 py-4 rounded-2xl transition-all font-semibold",
        active ? "bg-blue-500 text-white shadow-xl shadow-blue-500/20" : "text-[#86868B] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]")}>
      <Icon size={24} />
      <span className="hidden md:block text-[15px]">{label}</span>
      {active && <div className="hidden md:block ml-auto w-1.5 h-1.5 bg-white rounded-full shadow-sm" />}
    </button>
  );
}
