import React, { ReactNode } from "react";

import ArchiveReport from "@/svgs/app/profile/ArchiveReport";
import BankDetails from "@/svgs/app/profile/BankDetails";
import CitizenAcademy from "@/svgs/app/profile/CitizenAcademy";
import DigitalVaultCheck from "@/svgs/app/profile/DigitalVaultCheck";
import Feedback from "@/svgs/app/profile/Feedback";
import MyPollingUnit from "@/svgs/app/profile/MyPollingUnit";
import Notification from "@/svgs/app/profile/Notification";
import Profile from "@/svgs/app/profile/Profile";
import PUCheck from "@/svgs/app/profile/PUCheck";
import PULocator from "@/svgs/app/profile/PULocator";
import Security from "@/svgs/app/profile/Security";
import Support from "@/svgs/app/profile/Support";
import SignOut from "@/svgs/app/SignOut";

// Core Me/Profile Types

export type UserType = "observer" | "volunteer" | "public-viewer";

export type VerificationStatus = "pending" | "verified" | "none";

export type MeUser = {
  fullName: string;
  username: string;
  roleLabel: string;
  userType: UserType;
  verificationStatus: VerificationStatus;
  pollingUnit: string;
  avatarUri?: string;
  pvcVerifiedDate?: string;
  reportsCount: number;
  electionsCount: number;
  incidentsCount: number;
};

export type MeMenuItemId =
  | "personal-profile"
  | "security"
  | "app-lock"
  | "polling-unit"
  | "upgrade-user"
  | "pvc-verification"
  | "bank-details"
  | "digital-vault"
  | "citizen-academy"
  | "polling-unit-locator"
  | "notifications"
  | "archive-reports"
  | "support-faq"
  | "feedback"
  | "delete-account"
  | "sign-out";

export type MeMenuItem = {
  id: MeMenuItemId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  tone?: "default" | "danger";
};

export type MeBannerConfig = {
  show: boolean;
  title: string;
  subtitle: string;
  type:
    | "complete-profile"
    | "observer-registration"
    | "volunteer-registration"
    | "none";
};

// Helpers

function icon(node: React.ComponentType<{ width?: number; height?: number }>) {
  return React.createElement(node, { width: 42, height: 42 });
}

function hasPollingUnit(user: MeUser): boolean {
  return Boolean(user.pollingUnit?.trim());
}

function getPollingUnitSubtitle(user: MeUser): string {
  return hasPollingUnit(user)
    ? user.pollingUnit
    : "Set your polling unit information";
}

function getDigitalVaultSubtitle(user: MeUser): string {
  return `${user.reportsCount} reports across ${user.electionsCount} elections`;
}

// Banner Logic

export function getMeBanner(user: MeUser): MeBannerConfig {
  if (user.userType === "observer" && user.verificationStatus === "pending") {
    return {
      show: true,
      title: "Complete your profile",
      subtitle: "Upload your PVC to unlock full observer access.",
      type: "complete-profile",
    };
  }

  if (user.userType === "volunteer") {
    return {
      show: true,
      title: "Observer Registration",
      subtitle: "Upgrade to become an observer",
      type: "observer-registration",
    };
  }

  if (user.userType === "public-viewer") {
    return {
      show: true,
      title: "Volunteer Registration",
      subtitle: "Upgrade to participate in your polling unit.",
      type: "volunteer-registration",
    };
  }

  return {
    show: false,
    title: "",
    subtitle: "",
    type: "none",
  };
}

// Account Menu Logic

export function getMeAccountItems(user: MeUser): MeMenuItem[] {
  const items: MeMenuItem[] = [
    {
      id: "personal-profile",
      title: "Personal Profile",
      subtitle: "Edit your profile information",
      icon: icon(Profile),
    },
    {
      id: "security",
      title: "Security",
      subtitle: "Set new login password",
      icon: icon(Security),
    },
    {
      id: "app-lock",
      title: "App Lock",
      subtitle: "Use biometrics or your PIN to open the app",
      icon: icon(Security),
    },
    {
      id: "polling-unit",
      title: "My Polling Unit",
      subtitle: getPollingUnitSubtitle(user),
      icon: icon(MyPollingUnit),
    },
  ];

  if (user.userType === "public-viewer") {
    items.push({
      id: "upgrade-user",
      title: "Upgrade User Type",
      subtitle: "Become a volunteer and participate in your polling unit.",
      icon: icon(PUCheck),
    });
  }

  if (user.userType === "volunteer") {
    items.push({
      id: "upgrade-user",
      title: "Upgrade User Type",
      subtitle: "Submit your PVC to apply as a polling unit observer.",
      icon: icon(PUCheck),
    });
  }

  if (user.userType === "observer" && user.verificationStatus === "verified") {
    items.push({
      id: "pvc-verification",
      title: "PVC Verification",
      subtitle: user.pvcVerifiedDate
        ? `Verified: ${user.pvcVerifiedDate}`
        : "PVC verification complete",
      icon: icon(PUCheck),
    });

    items.push({
      id: "bank-details",
      title: "Observer Bank Detail",
      subtitle: "Manage observer payout details",
      icon: icon(BankDetails),
    });
  }

  if (user.userType === "observer" || user.userType === "volunteer") {
    items.push({
      id: "digital-vault",
      title: "Digital Vault",
      subtitle: getDigitalVaultSubtitle(user),
      icon: icon(DigitalVaultCheck),
    });
  }

  items.push({
    id: "citizen-academy",
    title: "Citizen Academy",
    subtitle: "Know all about election practices",
    icon: icon(CitizenAcademy),
  });

  return items;
}

export function getMeOtherItems(): MeMenuItem[] {
  return [
    {
      id: "polling-unit-locator",
      title: "Polling Unit Locator",
      subtitle: "Find polling units by state, LGA and ward",
      icon: icon(PULocator),
    },
    {
      id: "notifications",
      title: "Notifications",
      subtitle: "Manage alerts and app messages",
      icon: icon(Notification),
    },
    {
      id: "archive-reports",
      title: "Archive Reports",
      subtitle: "View previous election submissions",
      icon: icon(ArchiveReport),
    },
    {
      id: "support-faq",
      title: "Support & FAQ",
      subtitle: "Get help using Citizen Monitor",
      icon: icon(Support),
    },
    {
      id: "feedback",
      title: "Give Feedback",
      subtitle: "Tell us how to improve the app",
      icon: icon(Feedback),
    },
    {
      id: "delete-account",
      title: "Delete Account",
      subtitle: "Permanently delete your account and data",
      icon: icon(SignOut),
      tone: "danger",
    },
    {
      id: "sign-out",
      title: "Sign Out",
      subtitle: "Log out from this device",
      icon: icon(SignOut),
      tone: "danger",
    },
  ];
}

// Notification Settings
// Matches backend /profile/notifications response exactly.

export type NotificationSettingsState = {
  pollingUnitActivity: boolean;
  electionDayAlert: boolean;
  discussionReplies: boolean;
  resultAggregated: boolean;
  reportConfirmed: boolean;
  reportFlagged: boolean;
  securityAlerts: boolean;
  newsletter: boolean;
};

export const defaultNotificationSettings: NotificationSettingsState = {
  pollingUnitActivity: true,
  electionDayAlert: false,
  discussionReplies: false,
  resultAggregated: false,
  reportConfirmed: false,
  reportFlagged: false,
  securityAlerts: false,
  newsletter: true,
};

// Citizen Academy
// Static educational content for now. This is not user/profile dummy state.

export type AcademyItem = {
  id: string;
  title: string;
  category: string;
  readTime: string;
  description: string;
  content: string;
};

export const citizenAcademyItems: AcademyItem[] = [
  {
    id: "pvc-guide",
    title: "PVC Registration Guide",
    category: "Essential",
    readTime: "5 MIN READ",
    description:
      "Step-by-step process on how to register and collect your Permanent Voter Card.",
    content:
      "The Permanent Voter Card (PVC) is the primary identity document for every voter in Nigeria. Without it, you cannot cast your ballot.\n\nStep 1: Check your registration status on the official INEC portal. If you are not registered, wait for the Continuous Voter Registration (CVR) window.\n\nStep 2: Visit your local government headquarters or designated registration center with a valid ID such as National ID, Driver’s License, or Passport.\n\nStep 3: Provide your biometric data to the registration officer.\n\nStep 4: Collect your Temporary Voter Card and follow official collection updates for your PVC.",
  },
  {
    id: "voters-right",
    title: "Know Voters Right",
    category: "Essential",
    readTime: "5 MIN READ",
    description:
      "Understand what you can and cannot do at the polling unit as a citizen.",
    content:
      "Every citizen has the right to vote freely without intimidation. You have the right to observe the counting process peacefully and report irregularities through lawful channels.",
  },
  {
    id: "incident-reporting",
    title: "Incident Reporting",
    category: "Essential",
    readTime: "5 MIN READ",
    description:
      "How to accurately document and report irregularities during elections.",
    content:
      "When reporting an incident, capture clear photo or video evidence where safe. Note the time, location, and context. Submit reports through Citizen Monitor as soon as possible.",
  },
  {
    id: "electoral-act",
    title: "Electoral Act 2022",
    category: "Law",
    readTime: "5 MIN READ",
    description:
      "A quick guide to the legal framework governing election conduct in Nigeria.",
    content:
      "The Electoral Act 2022 is a core legal framework for elections in Nigeria. It covers voting procedures, electronic accreditation, offences, and responsibilities of election stakeholders.",
  },
];

// Archive Reports
// Kept as an empty compatibility export to avoid old screens crashing.
// Real vault/report data should now come from production APIs.

export type ArchiveReportItem = {
  id: string;
  type: "result" | "incident";
  title: string;
  date: string;
  time: string;
  partySummary?: string;
  evidenceLabel?: string;
  evidenceType?: "photo" | "video";
};

export type ArchiveElection = {
  id: string;
  title: string;
  location: string;
  electionType: string;
  reports: ArchiveReportItem[];
};

export const archiveData: {
  totalResults: number;
  totalIncidents: number;
  totalElections: number;
  elections: ArchiveElection[];
} = {
  totalResults: 0,
  totalIncidents: 0,
  totalElections: 0,
  elections: [],
};