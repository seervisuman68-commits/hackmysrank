import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import Login from "./pages/Login";

import CandidateSignup from "./pages/CandidateSignup";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import OwnerDashboard from "./pages/OwnerDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import Landing from "./pages/Landing";

import { PrivacyPolicy, TermsOfService, CookiePolicy, RefundPolicy } from "./pages/Legal";

import HRDashboard from "./pages/HRDashboard";
import CandidateDashboard from "./pages/CandidateDashboard";
import AptitudeTest from "./pages/AptitudeTest";
import VideoIntro from "./pages/VideoIntro";
import ReviewAssessment from "./pages/ReviewAssessment";
import ReviewTechnical from "./pages/ReviewTechnical";
import TechnicalTest from "./pages/TechnicalTest";
import GDDashboard from "./pages/GDDashboard";
import ScheduleInterview from "./pages/ScheduleInterview";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import CompleteProfile from "./pages/CompleteProfile";
import ResetPassword from "./pages/ResetPassword";

import CandidateProfile from "./pages/CandidateProfile";
import ResumeBuilder from "./pages/ResumeBuilder";
import HRAnalytics from "./pages/HRAnalytics";
import ManagerAnalytics from "./pages/ManagerAnalytics";
import AdminAnalytics from "./pages/AdminAnalytics";
import CandidateAnalytics from "./pages/CandidateAnalytics";
import InterviewPrep from "./pages/InterviewPrep";
import CompanyProfile from "./pages/CompanyProfile";
import InterviewProcess from "./pages/InterviewProcess";
import NotificationsCenter from "./pages/NotificationsCenter";
import NotificationSettings from "./pages/NotificationSettings";
import CompareCandidates from "./pages/CompareCandidates";
import InterviewRoom from "./pages/InterviewRoom";
import GDRoom from "./pages/GDRoom";
import { applyStoredTheme } from "./components/ThemeToggle";
import ErrorBoundary from "./components/ErrorBoundary";

applyStoredTheme();

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <ErrorBoundary fallbackTitle="HireZap Application View" fallbackDescription="An unexpected error occurred. Click reload to refresh the view.">
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Landing />} />
          {/* Google sign-in and email signup both go straight to candidate flow */}
          <Route path="/select-role" element={<Navigate to="/candidate-dashboard" replace />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/cookie-policy" element={<CookiePolicy />} />
          <Route path="/refund-policy" element={<RefundPolicy />} />
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/signup" element={<Navigate to="/candidate-signup" replace />} />
          <Route path="/candidate-signup" element={<CandidateSignup />} />

          <Route path="/jobs" element={<Jobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/company/:slug" element={<CompanyProfile />} />
          <Route path="/notifications" element={<NotificationsCenter />} />
          <Route path="/settings" element={<Navigate to="/settings/notifications" replace />} />
          <Route path="/settings/notifications" element={<NotificationSettings />} />
          <Route
            path="/owner-dashboard"
            element={
              <ProtectedRoute requiredRole="owner">
                <OwnerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute requiredRole="superadmin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager-dashboard"
            element={
              <ProtectedRoute requiredRole="manager">
                <HRDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hr-dashboard"
            element={
              <ProtectedRoute requiredRole="hr">
                <HRDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review-assessment/:assessmentId"
            element={
              <ProtectedRoute requiredRole={["hr", "manager"]}>
                <ReviewAssessment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review-technical/:assessmentId"
            element={
              <ProtectedRoute requiredRole={["hr", "manager"]}>
                <ReviewTechnical />
              </ProtectedRoute>
            }
          />
          <Route path="/compare-candidates" element={<CompareCandidates />} />
          <Route
            path="/complete-profile"
            element={
              <ProtectedRoute requiredRole="candidate">
                <CompleteProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/candidate-dashboard"
            element={
              <ProtectedRoute requiredRole="candidate">
                <CandidateDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/before-interview" element={<Navigate to="/candidate-dashboard?tab=before-interview" replace />} />
          <Route path="/before_interview" element={<Navigate to="/candidate-dashboard?tab=before-interview" replace />} />
          <Route path="/beforeinterview" element={<Navigate to="/candidate-dashboard?tab=before-interview" replace />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute requiredRole="candidate">
                <CandidateProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/resume-builder"
            element={
              <ProtectedRoute requiredRole="candidate">
                <ResumeBuilder />
              </ProtectedRoute>
            }
          />

          <Route
            path="/aptitude-test"
            element={
              <ProtectedRoute requiredRole="candidate">
                <AptitudeTest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/video-intro"
            element={
              <ProtectedRoute requiredRole="candidate">
                <VideoIntro />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technical-test"
            element={
              <ProtectedRoute requiredRole="candidate">
                <TechnicalTest />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gd-dashboard"
            element={
              <ProtectedRoute requiredRole={["hr", "manager"]}>
                <GDDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/schedule-interview"
            element={
              <ProtectedRoute requiredRole={["hr", "manager"]}>
                <ScheduleInterview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hr-analytics"
            element={
              <ProtectedRoute requiredRole={["hr", "superadmin", "manager"]}>
                <HRAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manager-analytics"
            element={
              <ProtectedRoute requiredRole={["hr", "manager", "superadmin", "owner"]}>
                <ManagerAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-analytics"
            element={
              <ProtectedRoute requiredRole={["superadmin", "owner"]}>
                <AdminAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-analytics"
            element={
              <ProtectedRoute requiredRole="candidate">
                <CandidateAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/interview-prep/:stage"
            element={
              <ProtectedRoute requiredRole="candidate">
                <InterviewPrep />
              </ProtectedRoute>
            }
          />
          <Route path="/interview-room/:id" element={<ProtectedRoute requiredRole={["hr","manager","superadmin","owner","candidate"]}><InterviewRoom /></ProtectedRoute>} />
          <Route path="/gd-room/:id" element={<ProtectedRoute requiredRole={["hr","manager","superadmin","owner","candidate"]}><GDRoom /></ProtectedRoute>} />
          <Route path="/interview-process" element={<ProtectedRoute requiredRole={["hr","manager","superadmin","owner"]}><InterviewProcess /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
    <Analytics />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
