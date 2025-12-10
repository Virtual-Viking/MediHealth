"use client";

import { useEffect, useState } from "react";
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
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function FinancePage() {
  const { user: _user } = useAuth();
  const [pendingPayments, setPendingPayments] = useState<PendingPaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<PendingPaymentItem | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"online" | "cheque" | "insurance" | null>(null);

  const fetchPendingPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await patientFinanceAPI.getPendingPayments();
      setPendingPayments(data);
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
    fetchPendingPayments();
  };

  return (
    <main className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance Dashboard</h1>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">Loading pending payments...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchPendingPayments}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : pendingPayments.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">No pending payments at this time.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingPayments.map((payment) => (
              <PaymentCard
                key={payment.appointment_id}
                payment={payment}
                onPayClick={(method) => {
                  setSelectedPayment(payment);
                  setPaymentMethod(method);
                }}
              />
            ))}
          </div>
        )}

        {selectedPayment && paymentMethod && (
          <PaymentModal
            payment={selectedPayment}
            method={paymentMethod}
            onClose={() => {
              setSelectedPayment(null);
              setPaymentMethod(null);
            }}
            onSuccess={handlePaymentSuccess}
          />
        )}
      </div>
    </main>
  );
}

interface PaymentCardProps {
  payment: PendingPaymentItem;
  onPayClick: (method: "online" | "cheque" | "insurance") => void;
}

function PaymentCard({ payment, onPayClick }: PaymentCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-4">
          {payment.doctor_photo_url ? (
            <Image
              src={payment.doctor_photo_url}
              alt={payment.doctor_name}
              width={60}
              height={60}
              className="rounded-full object-cover"
            />
          ) : (
            <div className="w-[60px] h-[60px] rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
              <span className="text-2xl">👤</span>
            </div>
          )}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{payment.doctor_name}</h3>
            <p className="text-sm text-gray-600">{payment.service_name || "Consultation"}</p>
            <p className="text-sm text-gray-500 mt-1">{formatDate(payment.appointment_date)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(payment.final_amount)}</p>
          {payment.discount_amount > 0 && (
            <p className="text-sm text-gray-500 line-through">
              {formatCurrency(payment.base_amount)}
            </p>
          )}
          {payment.discount_amount > 0 && (
            <p className="text-sm text-green-600">
              Discount: {formatCurrency(payment.discount_amount)}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 mt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Select Payment Method:</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => onPayClick("online")}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-blue-500 bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition"
          >
            <span>💳</span>
            <span>Online Payment</span>
          </button>
          <button
            onClick={() => onPayClick("cheque")}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-green-500 bg-green-50 text-green-700 font-medium hover:bg-green-100 transition"
          >
            <span>📄</span>
            <span>Cheque</span>
          </button>
          <button
            onClick={() => onPayClick("insurance")}
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-purple-500 bg-purple-50 text-purple-700 font-medium hover:bg-purple-100 transition"
          >
            <span>🏥</span>
            <span>Insurance</span>
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
