"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  patientFinanceAPI,
  insuranceAPI,
  PendingPaymentItem,
  InsurancePolicy,
  SavedPaymentCard,
} from "@/services/api";
import Image from "next/image";
import Link from "next/link";

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatDateTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function FinancePage() {
  const { user: _user } = useAuth();
  const [allPayments, setAllPayments] = useState<PendingPaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PendingPaymentItem | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cheque" | "insurance" | null>(null);
  
  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaymentType, setFilterPaymentType] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");

  const fetchPendingPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await patientFinanceAPI.getPendingPayments();
      setAllPayments(data);
    } catch (err: any) {
      setError(err.detail || "Failed to load pending payments. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPayments();
  }, []);

  const handlePaymentSuccess = () => {
    setSelectedPayment(null);
    setPaymentMethod(null);
    setShowPaymentDialog(false);
    fetchPendingPayments();
  };

  // Calculate summary metrics
  const summaryMetrics = useMemo(() => {
    const totalDues = allPayments.reduce((sum, p) => sum + p.final_amount, 0);
    const insuranceClaims = allPayments.filter(p => p.payment_method === "insurance").length;
    const approvedClaims = allPayments.filter(p => p.payment_status === "paid").length;
    const pendingClaims = allPayments.filter(p => !p.payment_status || p.payment_status === "pending").length;
    
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dueWithin30Days = allPayments
      .filter(p => {
        const appointmentDate = new Date(p.appointment_date);
        return appointmentDate <= thirtyDaysFromNow;
      })
      .reduce((sum, p) => sum + p.final_amount, 0);

    return {
      totalDues,
      insuranceClaims,
      approvedClaims,
      pendingClaims,
      dueWithin30Days,
    };
  }, [allPayments]);

  // Filter and search payments
  const filteredPayments = useMemo(() => {
    return allPayments.filter(payment => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          payment.doctor_name.toLowerCase().includes(query) ||
          payment.appointment_id.toString().includes(query) ||
          (payment.service_name && payment.service_name.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Payment type filter
      if (filterPaymentType && payment.payment_method !== filterPaymentType) {
        return false;
      }

      // Date range filter
      if (filterDateFrom) {
        const paymentDate = new Date(payment.appointment_date);
        const fromDate = new Date(filterDateFrom);
        if (paymentDate < fromDate) return false;
      }

      if (filterDateTo) {
        const paymentDate = new Date(payment.appointment_date);
        const toDate = new Date(filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        if (paymentDate > toDate) return false;
      }

      return true;
    });
  }, [allPayments, searchQuery, filterPaymentType, filterDateFrom, filterDateTo]);

  const activeFiltersCount = [filterPaymentType, filterDateFrom, filterDateTo].filter(Boolean).length;

  return (
    <main className="flex-1 p-6 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Finance Dashboard</h1>

        {isLoading ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-gray-500">Loading payments...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchPendingPayments}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Summary Metrics */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="grid grid-cols-5 gap-6">
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Total Dues</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.totalDues)}</p>
                </div>
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Insurance claims</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryMetrics.insuranceClaims}</p>
                </div>
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Approved claims</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryMetrics.approvedClaims}</p>
                </div>
                <div className="text-center border-r border-gray-200 last:border-r-0">
                  <p className="text-sm text-gray-600 mb-2">Pending claims</p>
                  <p className="text-2xl font-bold text-gray-900">{summaryMetrics.pendingClaims}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Due within 30 days</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(summaryMetrics.dueWithin30Days)}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 flex items-center gap-2">
                Last updated a minute ago
                <button onClick={fetchPendingPayments} className="hover:text-gray-700">
                  <span className="text-base">↻</span>
                </button>
              </p>
            </div>

            {/* Transactions Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Transactions</h2>
                
                {/* Filters and Search */}
                <div className="flex flex-wrap gap-3 mb-4">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm">
                    <span className="text-gray-600">Filter</span>
                    <span className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center text-xs font-medium">
                      {activeFiltersCount}
                    </span>
                  </div>
                  
                  {filterPaymentType && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <span className="text-gray-700">Payment type: {filterPaymentType}</span>
                      <button onClick={() => setFilterPaymentType("")} className="text-gray-500 hover:text-gray-700">×</button>
                    </div>
                  )}
                  
                  {(filterDateFrom || filterDateTo) && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                      <span className="text-gray-700">
                        Date: {filterDateFrom ? formatDate(filterDateFrom) : "Start"} - {filterDateTo ? formatDate(filterDateTo) : "End"}
                      </span>
                      <button onClick={() => { setFilterDateFrom(""); setFilterDateTo(""); }} className="text-gray-500 hover:text-gray-700">×</button>
                    </div>
                  )}
                  
                  <div className="flex-1 flex gap-2 justify-end">
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                    />
                    <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm">
                      🔍
                    </button>
                  </div>
                </div>

                {/* Filter Options */}
                <div className="flex gap-3 mb-6">
                  <select
                    value={filterPaymentType}
                    onChange={(e) => setFilterPaymentType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Payment Types</option>
                    <option value="online">Online</option>
                    <option value="cheque">Cheque</option>
                    <option value="insurance">Insurance</option>
                  </select>
                  
                  <input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    placeholder="From Date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  
                  <input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    placeholder="To Date"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Table */}
                {filteredPayments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No transactions found matching your filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Transaction Id</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid to</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Payment Type</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Amount Due</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Payment Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Paid for</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredPayments.map((payment) => (
                          <TransactionRow
                            key={payment.appointment_id}
                            payment={payment}
                            onPayNow={() => {
                              setSelectedPayment(payment);
                              setShowPaymentDialog(true);
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Payment Method Selection Dialog */}
        {showPaymentDialog && selectedPayment && !paymentMethod && (
          <PaymentMethodDialog
            payment={selectedPayment}
            onClose={() => {
              setShowPaymentDialog(false);
              setSelectedPayment(null);
            }}
            onSelectMethod={(method) => setPaymentMethod(method)}
          />
        )}

        {/* Payment Form Dialog */}
        {selectedPayment && paymentMethod && (
          <PaymentModal
            payment={selectedPayment}
            method={paymentMethod}
            onClose={() => {
              setSelectedPayment(null);
              setPaymentMethod(null);
              setShowPaymentDialog(false);
            }}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    </main>
  );
}

interface TransactionRowProps {
  payment: PendingPaymentItem;
  onPayNow: () => void;
}

function TransactionRow({ payment, onPayNow }: TransactionRowProps) {
  const getPaymentStatusBadge = (status: string | null | undefined) => {
    if (!status || status === "pending") {
      return <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>;
    }
    if (status === "paid") {
      return <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Paid</span>;
    }
    if (status === "overdue") {
      return <span className="px-3 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Overdue</span>;
    }
    if (status === "draft") {
      return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Draft</span>;
    }
    return <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">{status}</span>;
  };

  const isPaid = payment.payment_status === "paid";

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">APT{payment.appointment_id}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(payment.appointment_date)}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {payment.doctor_photo_url ? (
            <Image
              src={payment.doctor_photo_url}
              alt={payment.doctor_name}
              width={24}
              height={24}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs">
              👤
            </div>
          )}
          <span className="text-sm text-gray-900">{payment.doctor_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 uppercase">{payment.payment_method || "PENDING"}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatCurrency(payment.final_amount)}</td>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">
        {isPaid ? formatCurrency(0) : formatCurrency(payment.final_amount)}
      </td>
      <td className="px-4 py-3">{getPaymentStatusBadge(payment.payment_status)}</td>
      <td className="px-4 py-3 text-sm text-gray-600">
        Appointment: {payment.service_name || "Consultation"}
      </td>
      <td className="px-4 py-3">
        {!isPaid && (
          <button
            onClick={onPayNow}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition"
          >
            PAY NOW
          </button>
        )}
      </td>
    </tr>
  );
}

interface PaymentMethodDialogProps {
  payment: PendingPaymentItem;
  onClose: () => void;
  onSelectMethod: (method: "online" | "cheque" | "insurance") => void;
}

function PaymentMethodDialog({ payment, onClose, onSelectMethod }: PaymentMethodDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Select Payment Method</h2>
            <p className="text-sm text-gray-600 mt-1">
              Payment for {payment.service_name || "Consultation"} - {formatCurrency(payment.final_amount)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => onSelectMethod("online")}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100 transition group"
            >
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition">
                💳
              </div>
              <span className="font-semibold text-lg">Online Payment</span>
              <span className="text-xs text-blue-600">Pay with Credit/Debit Card</span>
            </button>
            
            <button
              onClick={() => onSelectMethod("cheque")}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-green-500 bg-green-50 text-green-700 hover:bg-green-100 transition group"
            >
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition">
                📄
              </div>
              <span className="font-semibold text-lg">Cheque</span>
              <span className="text-xs text-green-600">Upload Cheque Images</span>
            </button>
            
            <button
              onClick={() => onSelectMethod("insurance")}
              className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100 transition group"
            >
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center text-3xl group-hover:scale-110 transition">
                🏥
              </div>
              <span className="font-semibold text-lg">Insurance</span>
              <span className="text-xs text-purple-600">Submit Insurance Claim</span>
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface PaymentModalProps {
  payment: PendingPaymentItem;
  method: "online" | "cheque" | "insurance";
  onClose: () => void;
  onSuccess: () => void;
}

function PaymentModal({ payment, method, onClose, onSuccess }: PaymentModalProps) {
  if (method === "online") {
    return <OnlinePaymentForm payment={payment} onClose={onClose} onSuccess={onSuccess} />;
  } else if (method === "cheque") {
    return <ChequePaymentForm payment={payment} onClose={onClose} onSuccess={onSuccess} />;
  } else {
    return <InsurancePaymentForm payment={payment} onClose={onClose} onSuccess={onSuccess} />;
  }
}

function OnlinePaymentForm({ payment, onClose, onSuccess }: PaymentModalProps) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<SavedPaymentCard[]>([]);
  const [useSavedCard, setUseSavedCard] = useState<number | null>(null);

  useEffect(() => {
    patientFinanceAPI.listSavedCards().then(setSavedCards).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let cardLastFour = "";
      let cardBrand = "";
      let expiryMonthNum = 0;
      let expiryYearNum = 0;
      let cardholderNameValue = "";

      if (useSavedCard) {
        const savedCard = savedCards.find((c) => c.id === useSavedCard);
        if (!savedCard) {
          throw new Error("Selected card not found");
        }
        cardLastFour = savedCard.card_last_four;
        cardBrand = savedCard.card_brand;
        expiryMonthNum = savedCard.expiry_month;
        expiryYearNum = savedCard.expiry_year;
        cardholderNameValue = savedCard.cardholder_name || "";
      } else {
        // Extract last 4 digits from card number
        const cleaned = cardNumber.replace(/\s/g, "");
        if (cleaned.length < 4) {
          throw new Error("Invalid card number");
        }
        cardLastFour = cleaned.slice(-4);
        cardBrand = cleaned.startsWith("4") ? "Visa" : "Mastercard"; // Simple detection
        expiryMonthNum = parseInt(expiryMonth);
        expiryYearNum = parseInt(expiryYear);
        cardholderNameValue = cardholderName;
      }

      await patientFinanceAPI.submitOnlinePayment({
        appointment_id: payment.appointment_id,
        card_last_four: cardLastFour,
        card_brand: cardBrand,
        expiry_month: expiryMonthNum,
        expiry_year: expiryYearNum,
        cardholder_name: cardholderNameValue,
        save_card: saveCard && !useSavedCard,
      });

      onSuccess();
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to process payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Online Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-900">Payment Amount</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">
              {formatCurrency(payment.final_amount)}
            </p>
            {payment.discount_amount > 0 && (
              <p className="text-sm text-blue-700 mt-1">
                Original: {formatCurrency(payment.base_amount)} | Discount:{" "}
                {formatCurrency(payment.discount_amount)}
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {savedCards.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Use Saved Card
              </label>
              <select
                value={useSavedCard || ""}
                onChange={(e) => setUseSavedCard(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Enter new card</option>
                {savedCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.card_brand} •••• {card.card_last_four} (Exp: {card.expiry_month}/
                    {card.expiry_year})
                  </option>
                ))}
              </select>
            </div>
          )}

          {!useSavedCard && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Card Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\s/g, "");
                    const formatted = value.match(/.{1,4}/g)?.join(" ") || value;
                    setCardNumber(formatted.slice(0, 19));
                  }}
                  placeholder="1234 5678 9012 3456"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cardholder Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="John Doe"
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Month <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={expiryMonth}
                    onChange={(e) => setExpiryMonth(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                      <option key={month} value={month.toString().padStart(2, "0")}>
                        {month.toString().padStart(2, "0")}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Year <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={expiryYear}
                    onChange={(e) => setExpiryYear(e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">YYYY</option>
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(
                      (year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CVV <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    required
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={saveCard}
                  onChange={(e) => setSaveCard(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Save card for future use
              </label>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Processing..." : "Submit Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ChequePaymentForm({ payment, onClose, onSuccess }: PaymentModalProps) {
  const [frontImage, setFrontImage] = useState<File | null>(null);
  const [backImage, setBackImage] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!frontImage || !backImage) {
      setError("Please upload both front and back images of the cheque");
      return;
    }

    setIsSubmitting(true);

    try {
      await patientFinanceAPI.submitChequePayment(payment.appointment_id, [
        frontImage,
        backImage,
      ]);
      onSuccess();
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to submit cheque payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Cheque Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-sm font-medium text-green-900">Payment Amount</p>
            <p className="text-2xl font-bold text-green-900 mt-1">
              {formatCurrency(payment.final_amount)}
            </p>
            <p className="text-sm text-green-700 mt-2">
              Please upload self-attested photos of the cheque (front and back)
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cheque Front <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setFrontImage(e.target.files?.[0] || null)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
              />
              {frontImage && (
                <p className="text-xs text-gray-500 mt-1">{frontImage.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cheque Back <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setBackImage(e.target.files?.[0] || null)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-200"
              />
              {backImage && (
                <p className="text-xs text-gray-500 mt-1">{backImage.name}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !frontImage || !backImage}
              className="px-6 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Cheque"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InsurancePaymentForm({ payment, onClose, onSuccess }: PaymentModalProps) {
  const [insurancePolicies, setInsurancePolicies] = useState<InsurancePolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    insuranceAPI
      .listPolicies()
      .then((policies) => {
        const active = policies.filter((p) => {
          if (!p.coverage_end) return true;
          return new Date(p.coverage_end) >= new Date();
        });
        setInsurancePolicies(active);
        if (active.length > 0) {
          setSelectedPolicyId(active[0].id);
        }
      })
      .catch(() => {
        setError("Failed to load insurance policies");
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPolicyId) {
      setError("Please select an insurance policy");
      return;
    }

    setIsSubmitting(true);

    try {
      await patientFinanceAPI.submitInsurancePayment(
        payment.appointment_id,
        selectedPolicyId,
        files.length > 0 ? files : undefined
      );
      onSuccess();
    } catch (err: any) {
      setError(err.detail || err.message || "Failed to submit insurance payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Insurance Payment</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-sm font-medium text-purple-900">Payment Amount</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">
              {formatCurrency(payment.final_amount)}
            </p>
            <p className="text-sm text-purple-700 mt-2">
              Select your insurance policy and upload relevant documents
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {isLoading ? (
            <p className="text-gray-500">Loading insurance policies...</p>
          ) : insurancePolicies.length === 0 ? (
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
              <p className="text-sm text-yellow-800 mb-3">
                No active insurance policies found. Please add an insurance policy first.
              </p>
              <Link
                href="/dashboard/patient/insurance"
                className="inline-block px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-sm font-medium"
              >
                Add Insurance Policy
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Insurance Policy <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                >
                  {insurancePolicies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.insurer_name} - {policy.policy_number}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Insurance Documents (Optional)
                </label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => setFiles(Array.from(e.target.files || []))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
                {files.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-gray-600">
                    {files.map((file, idx) => (
                      <li key={idx}>• {file.name}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Upload PDFs or images of insurance documents if needed
                </p>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 font-medium hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || insurancePolicies.length === 0}
              className="px-6 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Insurance"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
