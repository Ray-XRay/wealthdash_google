import React, { useState, useMemo } from 'react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend
} from 'recharts';
import { Account, Currency, AccountType } from '../types';
import { CreditCard } from 'lucide-react';

interface AssetChartProps {
  accounts: Account[];
  rateCNYtoHKD: number; 
  rates?: Record<string, number>; 
  onAccountClick?: (accountId: string) => void;
  onHover?: (accountId: string | null) => void;
  enableAnimation?: boolean;
  highlightedId?: string | null;
  baseCurrency?: Currency; // New prop to control display currency
}

const COLORS = [
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
  '#6366f1', // Indigo
  '#14b8a6', // Teal
];

const getSymbol = (currency: Currency | string) => {
    switch (currency) {
        case Currency.HKD: return 'HK$';
        case Currency.CNY: return 'CN¥';
        case Currency.USD: return 'US$';
        case Currency.JPY: return 'JP¥';
        case Currency.EUR: return '€';
        case Currency.GBP: return '£';
        default: return '$';
    }
};

const safeNum = (val: any) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const CustomTooltip = ({ active, payload, baseCurrency }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur shadow-xl border border-slate-100 p-3 rounded-lg text-sm z-50 min-w-[150px]">
        <p className="font-bold text-slate-800 mb-1.5">{data.name}</p>
        <div className="space-y-1">
           <div className="flex justify-between items-center text-slate-600">
               <span>Val ({baseCurrency}):</span>
               <span className="font-mono font-medium">{getSymbol(baseCurrency)}{safeNum(data.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
           </div>
           <div className="flex justify-between items-center text-slate-400 text-xs pt-1 border-t border-slate-100 mt-1">
               <span>Original:</span>
               <span>{safeNum(data.originalValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {data.currency}</span>
           </div>
          <div className="mt-2 text-[10px] text-slate-400 uppercase tracking-wider font-semibold">{data.type}</div>
        </div>
      </div>
    );
  }
  return null;
};

export const AssetChart: React.FC<AssetChartProps> = ({ 
    accounts, 
    rateCNYtoHKD, 
    rates, 
    onAccountClick, 
    onHover,
    enableAnimation = true, 
    highlightedId,
    baseCurrency = Currency.HKD
}) => {
  const [focusName, setFocusName] = useState<string | null>(null);
  
  const safeRates = rates || { 
      [Currency.HKD]: 1, 
      [Currency.CNY]: rateCNYtoHKD || 1.08 
  };

  const totalData = useMemo(() => {
    return accounts.map(acc => {
      const rawBal = safeNum(acc.balance);
      
      // 1. Convert to HKD first (Standard Base)
      const rateToHKD = safeRates[acc.currency] || (acc.currency === Currency.HKD ? 1 : 0); 
      const safeRateToHKD = rateToHKD === 0 ? 1 : rateToHKD;
      const valInHKD = rawBal * safeRateToHKD;

      // 2. Convert HKD to Target Base Currency
      let finalVal = valInHKD;
      if (baseCurrency !== Currency.HKD) {
          const baseRateToHKD = safeRates[baseCurrency] || 1;
          finalVal = valInHKD / baseRateToHKD;
      }

      return {
        id: acc.id,
        name: acc.name || 'Unknown',
        value: finalVal, 
        originalValue: rawBal,
        currency: acc.currency,
        type: acc.type
      };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);
  }, [accounts, safeRates, baseCurrency]);

  const activeData = useMemo(() => {
      if (highlightedId) {
          return totalData.find(d => d.id === highlightedId);
      }
      if (focusName) {
          return totalData.find(d => d.name === focusName);
      }
      return null;
  }, [highlightedId, focusName, totalData]);

  const stats = useMemo(() => {
      const totalVal = totalData.reduce((a, b) => a + b.value, 0) || 1;
      
      const investmentVal = totalData
        .filter(d => d.type === AccountType.INVESTMENT)
        .reduce((a, b) => a + b.value, 0);
      
      const cashVal = totalData
        .filter(d => d.type === AccountType.BANK || d.type === AccountType.WALLET)
        .reduce((a, b) => a + b.value, 0);

      return {
          investPercent: ((investmentVal / totalVal) * 100).toFixed(1),
          cashPercent: ((cashVal / totalVal) * 100).toFixed(1)
      };
  }, [totalData]);

  const handleClick = (data: any) => {
    if (onAccountClick && data && data.id) {
      onAccountClick(data.id);
    }
  };

  const handleLegendClick = (entry: any) => {
    const name = entry.value;
    setFocusName(prev => prev === name ? null : name);
  };

  const visibleAccounts = useMemo(() => accounts.filter(a => a.balance !== 0), [accounts]);

  if (totalData.length === 0) return null;

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 animate-in fade-in duration-700 flex flex-col">
      {/* --- TOP SECTION: CHART --- */}
      <div className="p-6 md:p-8 flex flex-col md:flex-row gap-8 min-h-[380px]">
          <div className="flex-1 relative">
             <h3 className="font-bold text-slate-800 text-lg mb-4">Asset Distribution ({baseCurrency} Eq)</h3>
             <div className="h-[300px] w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={totalData} 
                    cx="50%" 
                    cy="50%" 
                    innerRadius={70} 
                    outerRadius={110} 
                    paddingAngle={4} 
                    dataKey="value" 
                    cornerRadius={6} 
                    onClick={handleClick} 
                    cursor="pointer" 
                    isAnimationActive={enableAnimation}
                  >
                    {totalData.map((entry, index) => {
                      const isDimmed = activeData ? (activeData.id !== entry.id && activeData.name !== entry.name) : false;
                      const isHighlighted = activeData && (activeData.id === entry.id || activeData.name === entry.name);

                      return (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]} 
                          strokeWidth={0} 
                          className="cursor-pointer transition-all duration-300 ease-in-out"
                          style={{
                            opacity: isDimmed ? 0.2 : 1,
                            filter: isDimmed ? 'grayscale(100%)' : 'none',
                            transform: isHighlighted ? 'scale(1.05)' : 'scale(1)',
                            transformOrigin: 'center center',
                            outline: 'none'
                          }}
                        />
                      );
                    })}
                  </Pie>
                  <Tooltip content={<CustomTooltip baseCurrency={baseCurrency} />} />
                  <Legend 
                    onClick={handleLegendClick}
                    verticalAlign="bottom" 
                    height={60} 
                    iconType="circle" 
                    iconSize={8}
                    wrapperStyle={{ 
                      fontSize: '11px', 
                      color: '#64748b', 
                      cursor: 'pointer',
                      paddingTop: '20px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              
              <div className="absolute top-[42%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none w-32 flex flex-col items-center justify-center">
                  {activeData ? (
                      <div className="animate-in fade-in zoom-in duration-300">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate w-full">{activeData.name}</div>
                          <div className={`text-xl font-extrabold text-blue-600`}>
                             {getSymbol(activeData.currency)}
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
                          <div className="text-3xl font-extrabold text-slate-800">{accounts.length}</div>
                          <div className="text-[10px] text-slate-400 mt-1">Assets</div>
                      </div>
                  )}
              </div>
             </div>
          </div>
          
          <div className="w-full md:w-64 flex flex-col gap-4 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-6">
              <div className="p-5 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl transition-all hover:scale-105 border border-emerald-100/50">
                  <div className="text-xs font-bold text-emerald-600 uppercase mb-1">Invested</div>
                  <div className="text-3xl font-bold text-emerald-700">{stats.investPercent}%</div>
                  <div className="text-[10px] text-emerald-400 font-medium mt-1">Stocks & Funds</div>
              </div>
              <div className="p-5 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl transition-all hover:scale-105 border border-blue-100/50">
                  <div className="text-xs font-bold text-blue-500 uppercase mb-1">Cash</div>
                  <div className="text-3xl font-bold text-blue-700">{stats.cashPercent}%</div>
                  <div className="text-[10px] text-blue-400 font-medium mt-1">Liquid Assets</div>
              </div>
          </div>
      </div>

      {/* --- BOTTOM SECTION: ASSET LIST --- */}
      {visibleAccounts.length > 0 && (
          <div className="bg-slate-50/50 p-6 md:p-8 rounded-b-3xl border-t border-slate-100">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CreditCard size={18} className="text-slate-400"/> Your Assets</h3>
                <span className="text-xs font-bold bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-md shadow-sm">{visibleAccounts.length} items</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {visibleAccounts.map(acc => (
                    <div 
                      key={acc.id} 
                      onClick={() => onAccountClick && onAccountClick(acc.id)} 
                      onMouseEnter={() => onHover && onHover(acc.id)}
                      onMouseLeave={() => onHover && onHover(null)}
                      className={`p-4 rounded-xl border cursor-pointer transition-all flex justify-between items-center group bg-white ${highlightedId === acc.id ? 'border-blue-400 ring-2 ring-blue-50 ring-offset-0' : 'border-slate-200 hover:border-blue-300 hover:shadow-md'}`}
                    >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className={`w-1 self-stretch rounded-full flex-shrink-0 ${acc.currency === Currency.HKD ? 'bg-blue-500' : 'bg-amber-500'}`}></div>
                            <div className="min-w-0 pr-2">
                                <div className="font-bold text-slate-700 text-sm group-hover:text-blue-700 leading-tight break-words">{acc.name}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">{acc.type} • {acc.currency}</div>
                            </div>
                        </div>
                        <div className={`font-mono font-bold text-base whitespace-nowrap flex-shrink-0 ml-2 ${acc.balance < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                            {acc.balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                    </div>
                ))}
            </div>
          </div>
      )}
    </div>
  );
};