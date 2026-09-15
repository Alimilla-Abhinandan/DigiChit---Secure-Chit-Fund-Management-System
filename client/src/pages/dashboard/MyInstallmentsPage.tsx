import { useState } from 'react';
import { useInstallments } from '../../hooks/useInstallments';
import { InstallmentCard } from '../../components/installments/InstallmentCard';
import { PaymentHistory } from '../../components/installments/PaymentHistory';
import { LoadingSkeleton } from '../../components/cycles/LoadingSkeleton';
import { EmptyState } from '../../components/cycles/EmptyState';
import { Coins, RefreshCw } from 'lucide-react';
import type { InstallmentPaymentStatus } from '../../types/installment';
import { formatCurrency } from '../../utils/currency';

export const MyInstallmentsPage = () => {
    const [activeTab, setActiveTab] = useState<'ALL' | InstallmentPaymentStatus>('ALL');

    const {
        installments,
        loading,
        error,
        refetch
    } = useInstallments(undefined, undefined, true);

    const filteredInstallments = installments.filter((item) => {
        if (activeTab === 'ALL') return true;
        const currentStatus = item.paymentStatus || item.status || 'PENDING';
        return currentStatus === activeTab;
    });

    const pendingInstallments = installments.filter((i) => {
        const currentStatus = i.paymentStatus || i.status || 'PENDING';
        return currentStatus === 'PENDING' || currentStatus === 'OVERDUE';
    });
    const totalPendingDues = pendingInstallments.reduce((sum, item) => sum + (item.amount || 0) + (item.lateFee || 0) - (item.paidAmount || 0), 0);

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Header Banner */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                            <Coins className="w-3.5 h-3.5" />
                            <span>My Financial Dues</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                            My Installments & Payment Dues
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            Track mandatory monthly chit contributions, due dates, late fees, and receipts.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        <button
                            onClick={refetch}
                            disabled={loading}
                            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-xs flex items-center justify-center shrink-0"
                            title="Refresh Installments"
                        >
                            <RefreshCw className={`w-4 h-4 text-emerald-400 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Total Pending Dues Banner */}
                <div className="mt-6 p-4 bg-emerald-950 text-white rounded-2xl flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 block">Total Pending Dues</span>
                        <span className="text-2xl font-black text-white mt-0.5 block">{formatCurrency(totalPendingDues)}</span>
                    </div>
                    <span className="px-3 py-1 bg-emerald-800/80 text-emerald-200 text-xs font-bold rounded-xl border border-emerald-700">
                        {pendingInstallments.length} Dues Pending
                    </span>
                </div>

                {/* Status Tabs */}
                <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100 overflow-x-auto">
                    {(['ALL', 'PENDING', 'OVERDUE', 'PAID'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`
                                px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap
                                ${activeTab === tab
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                }
                            `}
                        >
                            {tab === 'ALL' ? 'All Installments' : tab}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl">
                    {error}
                </div>
            )}

            {/* Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Installment Cards */}
                <div className="lg:col-span-2 space-y-6">
                    {filteredInstallments.length === 0 ? (
                        <EmptyState
                            title="No Installments Found"
                            description={`No installments found matching status "${activeTab}".`}
                        />
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredInstallments.map((inst) => (
                                <InstallmentCard key={inst._id} installment={inst} onPaymentSuccess={refetch} />
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Column: Payment Receipts History */}
                <div className="lg:col-span-1">
                    <PaymentHistory installments={installments} />
                </div>
            </div>
        </div>
    );
};
