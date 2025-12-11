"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { patientFinanceAPI, PendingPaymentItem } from "@/services/api";
import PaymentTimelineSection from "@/components/patient/PaymentTimelineSection";

export default function PaymentHistoryPage() {
  const { user: _user } = useAuth();
  const [allPayments, setAllPayments] = useState<PendingPaymentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await patientFinanceAPI.getPendingPayments();
      // Sort by date descending (newest first)
      const sorted = data.sort((a, b) => 
        new Date(b.appointment_date).getTime() - new Date(a.appointment_date).getTime()
      );
      setAllPayments(sorted);
    } catch (err: any) {
      setError(err.detail || "Failed to load payment history. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  return (
    <main className="flex-1 p-4 overflow-y-auto" style={{ backgroundColor: "#ECF4F9" }}>
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Payment History</h1>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">Loading payment history...</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchPayments}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Retry
            </button>
          </div>
        ) : (
          <PaymentTimelineSection payments={allPayments} />
        )}
      </div>
    </main>
  );
}

