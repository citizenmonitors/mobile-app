export const Paths = {
  welcome: "/(public)/welcome",
  signIn: "/(public)/sign-in",
  unlock: "/(public)/unlock",
  signUp: "/(public)/sign-up",
  resetPassword: "/(public)/reset-password",
  setPassword: "/(public)/set-password",
  verifyEmail: "/(public)/verify-email",
  onboarding: "/(public)/onboarding",

  appHome: "/(app)/(tabs)/home",
  appElections: "/(app)/(tabs)/elections",
  appCollation: "/(app)/(tabs)/collation",
  appPulse: "/(app)/(tabs)/pulse",
  appMe: "/(app)/(tabs)/me",
  appNotifications: "/(app)/notifications",
  appDigitalVault: "/(app)/digital-vault",
  appArchiveReports: "/(app)/archive-reports",
  appElectionCalendar: "/(app)/elections-calendar",
  appLearningFeed: "/(app)/learning-feed",

  appHelpSupport: "/(app)/help-support",
  appBlockedUsers: "/(app)/blocked-users",
  appPulseCompose: "/(app)/pulse-compose",
  appPulsePost: (id: string) =>
    ({
      pathname: "/(app)/pulse-post/[id]" as const,
      params: { id },
    }) as const,

  appNotificationDetails: (id: string) =>
    ({
      pathname: "/(app)/notification/[id]" as const,
      params: { id },
    }),

  submitElectionReport: "/(app)/reporting/submit-election-report",
  reportIncident: "/(app)/reporting/report-incident",
  reportIncidentLive: "/(app)/reporting/report-incident-live",
  reportIncidentLiveReview: "/(app)/reporting/report-incident-live-review",

  voterPollingUnitLocator: "/(app)/voter-essentials/PollingUnitLocator",
  voterCitizenAcademy: "/(app)/voter-essentials/CitizenAcademy",
  voterNewsAndInsights: "/(app)/voter-essentials/NewsAndInsights",
  voterPressCoverage: "/(app)/voter-essentials/PressCoverage",
  voterDonateSupport: "/(app)/voter-essentials/DonateSupport",

  electionDetails: (id: string) =>
    ({
      pathname: "/(app)/election/[id]" as const,
      params: { id },
    }),

  newsDetails: (id: string) =>
    ({
      pathname: "/(app)/news/[id]" as const,
      params: { id },
    }),

  learningFeedDetails: (id: string) =>
    ({
      pathname: "/(app)/learning-feed" as const,
      params: { id },
    }),

  pressCoverageDetails: (id: string) =>
    ({
      pathname: "/(app)/press-coverage/[id]" as const,
      params: { id },
    }),
} as const;