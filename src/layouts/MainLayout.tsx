import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, FileBarChart, Settings, LogOut, Briefcase } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isAdmin, isSales, isAccountant } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Home', roles: ['ADMIN', 'SALES'] },
    { to: '/transactions', icon: ArrowLeftRight, label: 'GD', roles: ['ADMIN', 'SALES'] },
    { to: '/reports', icon: FileBarChart, label: 'BC', roles: ['ADMIN', 'SALES', 'ACCOUNTANT'] },
    { to: '/system', icon: Settings, label: 'HT', roles: ['ADMIN', 'SALES'] },
  ];

  // Fix: Show menus based on role booleans from AuthContext
  const filteredNavItems = navItems.filter(item => {
    if (isAdmin && item.roles.includes('ADMIN')) return true;
    if (isAccountant && item.roles.includes('ACCOUNTANT')) return true;
    if (isSales && item.roles.includes('SALES')) return true;
    return false;
  });

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-ink overflow-hidden text-ink">
      {/* Desktop Sidebar navigation */}
      <nav className="hidden md:flex w-24 border-r border-gold-primary/20 flex-col items-center py-8 gap-8 shrink-0">
        <div className="w-12 h-12 bg-gold-primary flex items-center justify-center rounded-sm mb-4">
          <Briefcase className="text-ink" size={24} />
        </div>

        <div className="flex flex-col gap-4">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={item.label}
              className={({ isActive }) => `nav-item-bold ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} />
            </NavLink>
          ))}
        </div>

        <button 
          onClick={handleLogout}
          className="mt-auto nav-item-bold border-red-500/30 text-red-500 hover:bg-red-500 hover:text-white"
          title="Đăng xuất"
        >
          <LogOut size={20} />
        </button>
      </nav>

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 bg-gray-bg relative overflow-hidden">
        {/* Top Header */}
        <header className="h-16 px-4 md:px-8 flex items-center justify-between bg-paper border-b border-neutral-100 shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-lg md:text-xl m-0 tracking-tight text-ink font-black">
              NGHIATIN <span className="text-gold-dark italic">GOLD</span>
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-black uppercase tracking-widest text-ink">
                {profile?.full_name || (profile?.role === 'ADMIN' ? 'Quản trị viên' : profile?.role === 'ACCOUNTANT' ? 'Kế toán' : profile?.role === 'SALES' ? 'Nhân viên bán hàng' : '')}
              </p>
            </div>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gold-primary/10 border border-gold-primary flex items-center justify-center font-black text-gold-dark text-xs md:text-base">
              {profile?.full_name?.charAt(0) || 'U'}
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto pb-20 md:pb-0">
            <Outlet />
          </div>
        </div>

        {/* Mobile Bottom Navigation - FIXED TO BOTTOM */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-ink border-t border-gold-primary/10 flex z-40">
          {filteredNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item-mobile ${isActive ? 'active' : ''}`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          <button 
            onClick={handleLogout}
            className="nav-item-mobile text-red-500"
          >
            <LogOut size={20} />
            <span>Thoát</span>
          </button>
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
