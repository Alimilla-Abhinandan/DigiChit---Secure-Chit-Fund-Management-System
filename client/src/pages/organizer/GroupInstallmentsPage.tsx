import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useInstallments } from '../../hooks/useInstallments';
import { useChitCycles } from '../../hooks/useChitCycles';
import api from '../../api/axios';
import { StatisticsCards } from '../../components/installments/StatisticsCards';
import { CollectionProgress } from '../../components/installments/CollectionProgress';
import { InstallmentTable } from '../../components/installments/InstallmentTable';
import { PayNowModal } from '../../components/installments/PayNowModal';
import type { Installment } from '../../types/installment';
import { ConfirmationDialog } from '../../components/cycles/ConfirmationDialog';
import { LoadingSkeleton } from '../../components/cycles/LoadingSkeleton';
import { ArrowLeft, PlusCircle, RefreshCw, Sparkles } from 'lucide-react';

export const GroupInstallmentsPage = () => {
    const { groupId } = useParams<{ groupId: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [group, setGroup] = useState<any>(null);
    const [groupLoading, setGroupLoading] = useState(true);
    const [selectedCycleId, setSelectedCycleId] = useState<string>('');
    const [selectedPaymentInstallment, setSelectedPaymentInstallment] = useState<Installment | null>(null);

    const [confirmWaive, setConfirmWaive] = useState<{ isOpen: boolean; installmentId: string | null }>({
        isOpen: false,
        installmentId: null
    });

    const { cycles } = useChitCycles(groupId);

    const {
        installments,
        stats,
        loading: installmentsLoading,
        actionLoading,
        error,
        refetch,
        generateCycleInstallments,
        waiveLateFee
    } = useInstallments(groupId, selectedCycleId);

    // Fetch Group details
    useEffect(() => {
        if (!groupId) return;
        const fetchGroup = async () => {
            try {
                const res = await api.get(`/chit-groups/details/${groupId}`);
                setGroup(res.data.data.group);
            } catch (err) {
                console.error('Failed to load group details', err);
            } finally {
                setGroupLoading(false);
            }
        };
        fetchGroup();
    }, [groupId]);

    // Auto-select active/latest cycle
    useEffect(() => {
        if (cycles.length > 0 && !selectedCycleId) {
            setSelectedCycleId(cycles[0]._id);
        }
    }, [cycles, selectedCycleId]);

    const isOrganizer = user?.id === group?.organizerId?._id || user?.id === group?.organizerId;
    const isAdmin = user?.role === 'ADMIN';

    const handleGenerateCycle = async () => {
        if (!selectedCycleId) return;
        try {
            await generateCycleInstallments(selectedCycleId);
        } catch (err) {
            console.error(err);
        }
    };

    const handleWaiveConfirm = async () => {
        if (!confirmWaive.installmentId) return;
        try {
            await waiveLateFee(confirmWaive.installmentId, 'Waived by organizer');
            setConfirmWaive({ isOpen: false, installmentId: null });
        } catch (err) {
            console.error(err);
        }
    };

    if (groupLoading || installmentsLoading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12">
            {/* Back Nav */}
            <button
                onClick={() => navigate(groupId ? `/chit-details/${groupId}` : '/my-chits')}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition cursor-pointer"
            >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Chit Group</span>
            </button>

            {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl">
                    {error}
                </div>
            )}

            {/* Header Toolbar */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200/80 shadow-xs">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Installment Collections</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                            {group?.name ? `${group.name} — Collections` : 'Group Installment Management'}
                        </h1>
                        <p className="text-xs text-slate-500 mt-1">
                            Manage member monthly contributions, track collection rate, and handle late fee waivers.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={refetch}
                            disabled={installmentsLoading}
                            className="p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50 shadow-xs flex items-center justify-center shrink-0"
                            title="Refresh Data"
                        >
                            <RefreshCw className={`w-4 h-4 text-emerald-400 ${installmentsLoading ? 'animate-spin' : ''}`} />
                        </button>

                        {(isOrganizer || isAdmin) && selectedCycleId && (
                            <button
                                onClick={handleGenerateCycle}
                                disabled={actionLoading === 'generate'}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer disabled:opacity-50"
                            >
                                <PlusCircle className="w-4 h-4" />
                                <span>Generate Cycle Dues</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Cycle Selector Bar */}
                {cycles.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center gap-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Select Cycle:</span>
                        <select
                            value={selectedCycleId}
                            onChange={(e) => setSelectedCycleId(e.target.value)}
                            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer"
                        >
                            {cycles.map((c) => (
                                <option key={c._id} value={c._id}>
                                    Cycle #{c.cycleNumber} ({c.status})
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Collection Statistics */}
            <StatisticsCards stats={stats} />

            {/* Collection Progress Bar */}
            {stats && (
                <CollectionProgress
                    collectedAmount={stats.totalCollectedAmount}
                    expectedAmount={stats.totalExpectedAmount}
                    percentage={stats.collectionPercentage}
                />
            )}

            {/* Installment Table */}
            <InstallmentTable
                installments={installments}
                cycles={cycles}
                currency={group?.financialConfig?.currency || group?.currency || 'INR'}
                isOrganizer={isOrganizer}
                isAdmin={isAdmin}
                currentUserId={user?.id || (user as any)?._id}
                actionLoading={actionLoading}
                onWaiveLateFee={(id) => setConfirmWaive({ isOpen: true, installmentId: id })}
                onPayNow={(inst) => setSelectedPaymentInstallment(inst)}
            />

            {/* Integrated PayNowModal for Direct Member / Organizer-Member Payment */}
            {selectedPaymentInstallment && (
                <PayNowModal
                    isOpen={!!selectedPaymentInstallment}
                    installment={selectedPaymentInstallment}
                    currency={group?.financialConfig?.currency || group?.currency || 'INR'}
                    onClose={() => setSelectedPaymentInstallment(null)}
                    onPaymentSuccess={() => {
                        setSelectedPaymentInstallment(null);
                        refetch();
                    }}
                />
            )}

            {/* Waive Late Fee Confirmation Modal */}
            <ConfirmationDialog
                isOpen={confirmWaive.isOpen}
                title="Waive Late Fee?"
                description="Are you sure you want to waive the accrued late fee for this member's installment?"
                confirmLabel="Waive Late Fee"
                confirmVariant="amber"
                isLoading={actionLoading?.startsWith('waive')}
                onConfirm={handleWaiveConfirm}
                onCancel={() => setConfirmWaive({ isOpen: false, installmentId: null })}
            />
        </div>
    );
};
