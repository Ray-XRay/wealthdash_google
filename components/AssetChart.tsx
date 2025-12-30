import React, { useState, useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { Account, Currency } from '../types';

interface AssetChartProps {
  accounts: Account[];
  rateCNYtoHKD: number;
  onAccountClick?: (accountId: string) => void;
  enableAnimation?: boolean;
  highlightedId?: string | null;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', 
  '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#d946ef',
];

const safeNum = (val: any) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

// Recharts Tooltip Component
const CustomTooltip = ({ active, payload, currency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-100 p-3 rounded-lg text-sm z-50 min-w-[150px]">
        <p className="font-bold text-slate-800 mb-1.5">{data.name}</p>
        <div className="space-y-1">
          {currency === 'MIXED' ? (
             <>
               <div className="flex justify-between items-center text-slate-600"><span>HKD Eq:</span><span className="font-mono font-medium">${safeNum(data.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
               <div className="flex justify-between items-center text-slate-400 text-xs pt-1 border-t border-slate-100 mt-1"><span>Original:</span><span>{safeNum(data.originalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.currency}</span></div>
             </>
          ) : (
             <div className="flex justify-between items-center text-slate-600"><span>Balance:</span><span className="font-mono font-medium">{currency === Currency.HKD ? '$' : '¥'}{safeNum(data.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
          )}
          <div className="mt-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{data.type}</div>
        </div>
      </div>
    );
  }
  return null;
};

export const AssetChart: React.FC<AssetChartProps> = ({ accounts, rateCNYtoHKD, onAccountClick, enableAnimation = true, highlightedId }) => {
  const [focusName, setFocusName] = useState<string | null>(null);
  
  const safeRate = safeNum(rateCNYtoHKD) <= 0 ? 1 : safeNum(rateCNYtoHKD);

  const totalData = useMemo(() => {
    return accounts.map(acc => {
      const rawBal = safeNum(acc.balance);
      const val = acc.currency === Currency.CNY ? rawBal * safeRate : rawBal;
      return {
        id: acc.id,
        name: acc.name || 'Unknown',
        value: val,
        originalValue: rawBal,
        currency: acc.currency,
        type: acc.type
      };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
  }, [accounts, safeRate]);

  // Determine which data item is currently "active" (either by hover or legend click)
  const activeData = useMemo(() => {
      if (highlightedId) {
          return totalData.find(d => d.id === highlightedId);
      }
      if (focusName) {
          return totalData.find(d => d.name === focusName);
      }
      return null;
  }, [highlightedId, focusName, totalData]);

  const handleClick = (data: any) => {
    if (onAccountClick && data && data.id) {
      onAccountClick(data.id);
    }
  };

  const handleLegendClick = (entry: any) => {
    const name = entry.value;
    setFocusName(prev => prev === name ? null : name);
  };

  if (totalData.length === 0) return null;

  return (
    <div className="animate-in fade-in duration-700 h-full">
      {/* Main Overview: Asset Distribution (Pie Chart) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-8 h-full min-h-[380px]">
          <div className="flex-1 relative">
             <h3 className="font-bold text-slate-800 text-lg mb-4">Asset Distribution</h3>
             <div className="h-[300px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={totalData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={65} 
                    outerRadius={105} 
                    paddingAngle={3} 
                    dataKey="value" 
                    cornerRadius={4} 
                    onClick={handleClick} 
                    cursor="pointer" 
                    isAnimationActive={enableAnimation}
                  >
                    {totalData.map((entry, index) => {
                      // Logic: Dim if we have a focus/highlight AND this entry doesn't match it
                      const isDimmed = activeData ? (activeData.id !== entry.id && activeData.name !== entry.name) : false;
                      const isHighlighted = activeData && (activeData.id === entry.id || activeData.name === entry.name);

                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]} 
                          strokeWidth={0} 
                          className="cursor-pointer transition-all duration-300 ease-in-out"
                          style={{
                            opacity: isDimmed ? 0.15 : 1,
                            filter: isDimmed ? 'grayscale(100%) blur(1px)' : 'none',
                            transform: isHighlighted ? 'scale(1.03)' : 'scale(1)',
                            transformOrigin: 'center center',
                            outline: 'none'
                          }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomTooltip currency="MIXED" />} />
                  <Legend 
                    onClick={handleLegendClick}
                    verticalAlign="bottom" 
                    height={60} 
                    iconType="circle" 
                    iconSize={10}
                    wrapperStyle={{ 
                      fontSize: '12px', 
                      color: '#64748b', 
                      cursor: 'pointer',
                      paddingTop: '20px'
                    }}
                    formatter={(value) => {
                       const isDimmed = activeData && activeData.name !== value;
                       return (
                         <span style={{ 
                           opacity: isDimmed ? 0.3 : 1, 
                           fontWeight: isDimmed ? 400 : 600,
                           transition: 'all 0.3s ease' 
                         }}>
                           {value}
                         </span>
                       );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              {/* Dynamic Center "Floating Window" */}
              <div className="absolute top-[42%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none w-32 flex flex-col items-center justify-center">
                  {activeData ? (
                      <div className="animate-in fade-in zoom-in duration-300">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate w-full">{activeData.name}</div>
                          <div className={`text-xl font-extrabold ${activeData.currency === Currency.HKD ? 'text-blue-600' : 'text-amber-600'}`}>
                              {activeData.currency === Currency.HKD ? '$' : '¥'}
                              {activeData.originalValue >= 100000 
                                ? (activeData.originalValue / 1000).toFixed(1) + 'k' 
                                : activeData.originalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })
                              }
                          </div>
                          <div className="text-[9px] text-slate-400 font-medium mt-0.5">{activeData.currency}</div>
                      </div>
                  ) : (
                      <div className="animate-in fade-in duration-300">
                          <div className="text-xs text-slate-400 font-medium uppercase tracking-widest">Total</div>
                          <div className="text-3xl font-bold text-slate-700">{accounts.length}</div>
                          <div className="text-[10px] text-slate-400 mt-1">Assets</div>
                      </div>
                  )}
              </div>
             </div>
          </div>
          <div className="w-full md:w-64 flex flex-col gap-4 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6">
              <div className="p-4 bg-blue-50 rounded-xl transition-all hover:scale-105">
                  <div className="text-xs font-bold text-blue-500 uppercase mb-1">HKD Share</div>
                  <div className="text-2xl font-bold text-blue-700">{((totalData.filter(d => d.currency === Currency.HKD).reduce((a, b) => a + b.value, 0) / totalData.reduce((a,b) => a+b.value, 0)) * 100).toFixed(1)}%</div>
              </div>
              <div className="p-4 bg-amber-50 rounded-xl transition-all hover:scale-105">
                  <div className="text-xs font-bold text-amber-500 uppercase mb-1">CNY Share</div>
                  <div className="text-2xl font-bold text-amber-700">{((totalData.filter(d => d.currency === Currency.CNY).reduce((a, b) => a + b.value, 0) / totalData.reduce((a,b) => a+b.value, 0)) * 100).toFixed(1)}%</div>
              </div>
          </div>
      </div>
    </div>
  );
};