import React, { useState, useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend 
} from 'recharts';
import { Sparkles, AlertCircle, Upload, ArrowRight } from 'lucide-react';
import { Transaction, ExpenseCategory } from '../types';

interface ExpenseTrackerProps {
  rateCNYtoHKD: number;
  transactions: Transaction[];
  analysisResult: string;
  onClearData: () => void;
  headerContent?: React.ReactNode;
}

// 纯色用于 Legend 和 Fallback
const SOLID_COLORS = {
  [ExpenseCategory.DINING]: '#f59e0b',
  [ExpenseCategory.GROCERIES]: '#eab308',
  [ExpenseCategory.TRANSPORT]: '#3b82f6',
  [ExpenseCategory.SHOPPING]: '#ec4899',
  [ExpenseCategory.HOUSING]: '#6366f1',
  [ExpenseCategory.UTILITIES]: '#06b6d4',
  [ExpenseCategory.BILLS]: '#64748b',
  [ExpenseCategory.ENTERTAINMENT]: '#8b5cf6',
  [ExpenseCategory.HEALTH]: '#10b981',
  [ExpenseCategory.TRANSFER]: '#94a3b8',
  [ExpenseCategory.INCOME]: '#22c55e',
  [ExpenseCategory.INVESTMENT]: '#14b8a6', // Teal
  [ExpenseCategory.OTHER]: '#cbd5e1',
};

// 渐变色定义 (Start Color -> End Color)
const GRADIENTS = [
  { id: 'grad-dining', start: '#f59e0b', end: '#d97706' }, // Amber
  { id: 'grad-shopping', start: '#f472b6', end: '#db2777' }, // Pink
  { id: 'grad-transport', start: '#60a5fa', end: '#2563eb' }, // Blue
  { id: 'grad-investment', start: '#2dd4bf', end: '#0d9488' }, // Teal
  { id: 'grad-housing', start: '#818cf8', end: '#4f46e5' }, // Indigo
  { id: 'grad-entertainment', start: '#a78bfa', end: '#7c3aed' }, // Violet
  { id: 'grad-others', start: '#94a3b8', end: '#475569' }, // Slate
  { id: 'grad-default', start: '#cbd5e1', end: '#94a3b8' }, // Gray
];

// 映射分类到渐变 ID
const getGradientId = (category: string) => {
  switch (category) {
    case ExpenseCategory.DINING:
    case ExpenseCategory.GROCERIES:
      return 'url(#grad-dining)';
    case ExpenseCategory.SHOPPING:
      return 'url(#grad-shopping)';
    case ExpenseCategory.TRANSPORT:
      return 'url(#grad-transport)';
    case ExpenseCategory.INVESTMENT:
      return 'url(#grad-investment)';
    case ExpenseCategory.HOUSING:
    case ExpenseCategory.UTILITIES:
      return 'url(#grad-housing)';
    case ExpenseCategory.ENTERTAINMENT:
      return 'url(#grad-entertainment)';
    case ExpenseCategory.TRANSFER:
    case ExpenseCategory.BILLS:
      return 'url(#grad-others)';
    default:
      return 'url(#grad-default)';
  }
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const color = SOLID_COLORS[data.name as ExpenseCategory] || '#94a3b8';
    return (
      <div className="bg-white/90 backdrop-blur-md border border-slate-100 p-4 rounded-xl shadow-xl">
        <div className="flex items-center gap-2 mb-1">
           <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
           <p className="font-bold text-slate-800 text-sm">{data.name}</p>
        </div>
        <p className="font-mono text-lg font-bold text-slate-900">
          ${data.value.toLocaleString()}
        </p>
        <p className="text-[10px] text-slate-400 font-medium">
           {((data.percent || 0) * 100).toFixed(1)}% of total
        </p>
      </div>
    );
  }
  return null;
};

export const ExpenseTracker: React.FC<ExpenseTrackerProps> = ({ transactions, analysisResult, onClearData, headerContent }) => {
  const [activeTab, setActiveTab] = useState<'PIE' | 'LIST'>('PIE');

  // --- CHARTS DATA ---
  const chartData = useMemo(() => {
    const expenses = transactions.filter(t => t.amount < 0);
    const groups: Record<string, number> = {};
    
    expenses.forEach(t => {
      groups[t.category] = (groups[t.category] || 0) + Math.abs(t.amount);
    });

    const total = Object.values(groups).reduce((a, b) => a + b, 0);

    return Object.entries(groups)
      .map(([name, value]) => ({ 
        name, 
        value,
        percent: total > 0 ? value / total : 0 
      }))
      .sort((a, b) => b.value - a.value);
  }, [transactions]);

  const totalSpent = useMemo(() => {
      return transactions.filter(t => t.amount < 0).reduce((acc, t) => acc + Math.abs(t.amount), 0);
  }, [transactions]);

  // Calculate Max Transaction for Progress Bar visualization
  const maxTransactionVal = useMemo(() => {
    const expenses = transactions.filter(t => t.amount < 0).map(t => Math.abs(t.amount));
    return Math.max(...expenses, 1); 
  }, [transactions]);

  // --- EMPTY STATE ---
  if (transactions.length === 0) {
      return (
          <div className="space-y-8">
             {/* Match grid structure even for empty state for alignment */}
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {headerContent}
                    <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-sm flex flex-col items-center">
                        <div className="w-20 h-20 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-6">
                            <Upload size={36} />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-800 mb-3">No Expenses Tracked</h2>
                        <p className="text-slate-500 mb-8 max-w-md">
                            Click the <strong>Import</strong> button in the top right corner to upload your bank statement (PDF/Excel).
                        </p>
                    </div>
                </div>
                {/* Empty Right Column Placeholder if needed */}
             </div>
          </div>
      );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
        
        {/* LEFT COLUMN (2/3) - Chart & Main Content */}
        <div className="lg:col-span-2 space-y-6">
            
            {headerContent}

            {/* Charts Area */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 min-h-[450px]">
               <div className="flex items-center justify-between mb-8">
                   <h3 className="text-xl font-bold text-slate-800">Expense Breakdown</h3>
                   <div className="flex bg-slate-100 rounded-xl p-1.5 gap-1">
                       <button onClick={() => setActiveTab('PIE')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'PIE' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>Chart</button>
                       <button onClick={() => setActiveTab('LIST')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'LIST' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>List</button>
                   </div>
               </div>

               {activeTab === 'PIE' ? (
                   <div className="h-[350px] w-full relative">
                       <ResponsiveContainer width="100%" height="100%">
                           <PieChart>
                               <defs>
                                   {/* Define Linear Gradients for 3D Effect */}
                                   {GRADIENTS.map(grad => (
                                       <linearGradient key={grad.id} id={grad.id} x1="0" y1="0" x2="0" y2="1">
                                           <stop offset="0%" stopColor={grad.start} />
                                           <stop offset="100%" stopColor={grad.end} />
                                       </linearGradient>
                                   ))}
                                   {/* Drop Shadow Filter */}
                                   <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                                       <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
                                       <feOffset in="blur" dx="2" dy="4" result="offsetBlur" />
                                       <feFlood floodColor="rgba(0,0,0,0.15)" result="color" />
                                       <feComposite in="color" in2="offsetBlur" operator="in" result="shadow" />
                                       <feMerge>
                                           <feMergeNode in="shadow" />
                                           <feMergeNode in="SourceGraphic" />
                                       </feMerge>
                                   </filter>
                               </defs>
                               <Pie
                                 data={chartData}
                                 cx="50%" cy="50%"
                                 innerRadius={80} // Large inner radius for Donut
                                 outerRadius={130}
                                 paddingAngle={5}
                                 dataKey="value"
                                 cornerRadius={12} // Rounded corners
                                 stroke="none"
                                 filter="url(#shadow)" // Apply 3D Shadow
                               >
                                   {chartData.map((entry, index) => (
                                       <Cell 
                                          key={`cell-${index}`} 
                                          fill={getGradientId(entry.name)} 
                                          className="transition-all duration-300 hover:opacity-90 outline-none cursor-pointer" 
                                          stroke="rgba(255,255,255,0.1)"
                                          strokeWidth={1}
                                       />
                                   ))}
                               </Pie>
                               <Tooltip content={<CustomTooltip />} />
                               <Legend 
                                   verticalAlign="middle" 
                                   align="right" 
                                   layout="vertical" 
                                   iconType="circle"
                                   formatter={(value) => <span className="text-slate-600 font-semibold ml-1">{value}</span>}
                               />
                           </PieChart>
                       </ResponsiveContainer>
                       
                       {/* Center Label simulating hole depth */}
                       <div className="absolute top-1/2 left-1/2 transform -translate-x-[65%] -translate-y-1/2 text-center pointer-events-none">
                          <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Total</div>
                          <div className="text-xl font-extrabold text-slate-700">${(totalSpent/1000).toFixed(1)}k</div>
                       </div>
                   </div>
               ) : (
                   <div className="overflow-y-auto max-h-[350px] pr-2 custom-scrollbar">
                       <table className="w-full text-sm text-left border-separate border-spacing-y-2">
                           <thead className="text-xs text-slate-400 uppercase bg-slate-50 sticky top-0 z-10">
                               <tr>
                                   <th className="px-4 py-3 rounded-l-lg">Date</th>
                                   <th className="px-4 py-3">Merchant</th>
                                   <th className="px-4 py-3">Category</th>
                                   <th className="px-4 py-3 text-right rounded-r-lg">Amount</th>
                               </tr>
                           </thead>
                           <tbody>
                               {transactions.filter(t => t.amount < 0).map(t => {
                                   const val = Math.abs(t.amount);
                                   const pct = Math.min((val / maxTransactionVal) * 100, 100);
                                   const barColor = pct > 60 ? 'bg-red-500' : pct > 30 ? 'bg-amber-500' : 'bg-emerald-500';

                                   return (
                                   <tr key={t.id} className="group hover:bg-slate-50 transition-colors">
                                       <td className="px-4 py-3 text-slate-500 border-b border-slate-100 group-hover:border-transparent">{t.date}</td>
                                       <td className="px-4 py-3 font-semibold text-slate-700 border-b border-slate-100 group-hover:border-transparent">{t.description}</td>
                                       <td className="px-4 py-3 border-b border-slate-100 group-hover:border-transparent">
                                           <span className="px-2.5 py-1 rounded-full text-[10px] font-bold text-white shadow-sm" style={{ backgroundColor: SOLID_COLORS[t.category] || SOLID_COLORS[ExpenseCategory.OTHER] }}>{t.category}</span>
                                       </td>
                                       <td className="px-4 py-3 text-right border-b border-slate-100 group-hover:border-transparent min-w-[120px]">
                                            <div className="font-mono font-medium text-slate-700">${val.toLocaleString()}</div>
                                            {/* Visual Magnitude Bar - Adjusted to fill from left to right */}
                                            <div className="h-1.5 w-full bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                                                <div className={`h-full rounded-full opacity-80 ${barColor}`} style={{ width: `${pct}%` }}></div>
                                            </div>
                                       </td>
                                   </tr>
                               )})}
                           </tbody>
                       </table>
                   </div>
               )}
            </div>
        </div>

        {/* RIGHT COLUMN (1/3) - Sticky Sidebar */}
        <div className="lg:col-span-1">
             <div className="sticky top-24 space-y-6">
                 
                 {/* AI Insight Card (Moved here for balance) */}
                 <div className="bg-gradient-to-br from-slate-800 to-black rounded-3xl p-6 text-white shadow-xl relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none group-hover:bg-blue-500/30 transition-colors duration-500"></div>
                     <div className="relative z-10">
                         <div className="flex items-center gap-2 mb-4 text-blue-300">
                             <Sparkles size={20} />
                             <h3 className="font-bold text-sm uppercase tracking-widest">AI Financial Coach</h3>
                         </div>
                         <div className="flex flex-col gap-4">
                             <div>
                                 <p className="text-sm leading-relaxed text-slate-200">
                                     {analysisResult || "Analyzing your spending patterns..."}
                                 </p>
                             </div>
                             <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 text-center border border-white/10 shadow-lg">
                                 <div className="text-[10px] text-slate-400 uppercase font-bold mb-1 tracking-wider">Total Outflow</div>
                                 <div className="text-2xl font-extrabold text-white tracking-tight">${totalSpent.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                             </div>
                         </div>
                     </div>
                 </div>

                 {/* Top Spending Categories List */}
                 <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-8 flex flex-col">
                     <h3 className="text-xl font-bold text-slate-800 mb-6">Top Categories</h3>
                     <div className="space-y-4 flex-1">
                         {chartData.slice(0, 5).map((cat, idx) => (
                             <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all cursor-default border border-transparent hover:border-slate-100 group">
                                 <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm text-white font-bold text-[10px]" style={{ background: `linear-gradient(135deg, ${GRADIENTS.find(g => getGradientId(cat.name).includes(g.id))?.start || '#cbd5e1'}, ${GRADIENTS.find(g => getGradientId(cat.name).includes(g.id))?.end || '#94a3b8'})` }}>
                                         {cat.name.substring(0,2).toUpperCase()}
                                     </div>
                                     <div>
                                         <div className="font-bold text-slate-700 text-sm">{cat.name}</div>
                                         <div className="text-[10px] text-slate-400 font-medium">{cat.percent ? (cat.percent * 100).toFixed(1) : 0}%</div>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <div className="font-bold text-slate-800 text-sm">${cat.value.toLocaleString()}</div>
                                 </div>
                             </div>
                         ))}
                     </div>
                     
                     <div className="mt-8 pt-6 border-t border-slate-100">
                         <button onClick={onClearData} className="w-full py-4 rounded-xl border border-slate-200 text-slate-500 font-bold text-sm hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center gap-2 group">
                             <AlertCircle size={18} className="group-hover:stroke-2"/> Reset Expenses
                         </button>
                     </div>
                 </div>
             </div>
        </div>
    </div>
  );
};