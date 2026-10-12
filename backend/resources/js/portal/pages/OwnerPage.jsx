import React, { useEffect } from "react";
import { useWebsiteSession } from "../session/WebsiteSessionProvider.jsx";
import useOwnerReport from "../owner/useOwnerReport.js";
import useOwnerNavigation from "../owner/ownerNavigation.js";
import OwnerShell from "../owner/OwnerShell.jsx";
import OwnerOverview from "../owner/OwnerOverview.jsx";
import OwnerDownloads from "../owner/OwnerDownloads.jsx";
import OwnerMemberships from "../owner/OwnerMemberships.jsx";
import OwnerWebsite from "../owner/OwnerWebsite.jsx";
import OwnerUsage from "../owner/OwnerUsage.jsx";
import OwnerTracking from "../owner/OwnerTracking.jsx";
import OwnerAccounts from "../owner/OwnerAccounts.jsx";
import OwnerLicenses from "../owner/OwnerLicenses.jsx";
import { ErrorMessage } from "../owner/OwnerPrimitives.jsx";

export default function OwnerPage() {
  const { user, loading, sessionError, refresh: refreshSession } = useWebsiteSession();
  const navigation = useOwnerNavigation();
  const report = useOwnerReport(navigation.days, user);
  const { view, tab, navigate } = navigation;
  useEffect(() => {
    if (!loading && !user && !sessionError) {
      window.location.assign("/owner/login?next=" + encodeURIComponent(window.location.pathname + window.location.search));
    }
  }, [loading, user, sessionError]);
  const local = user?.email === "owner.local@vibyra.test";
  const protectedPage = view === "users" || (view === "memberships" && tab === "licenses");
  const data = report.data;
  return <OwnerShell navigation={navigation} user={user} report={report}>
    {sessionError ? <ErrorMessage onRetry={() => refreshSession().catch(() => {})}>{sessionError}</ErrorMessage>
      : loading || !user ? <div className="od-loading" role="status">Checking your sign-in…</div>
      : protectedPage ? view === "users" ? <OwnerAccounts key={user.id} ownerId={user.id} local={local} report={data} />
        : <OwnerLicenses key={user.id} local={local} />
      : <>
        {report.error && <ErrorMessage onRetry={report.refresh}>{data ? "Showing the last successfully loaded report. " + report.error : report.error}</ErrorMessage>}
        {!data && !report.error && <div className="od-skeleton" role="status" aria-label="Loading report"><div /><div /><div /><div /><span>Loading your report…</span></div>}
        {data && <>
          {view === "overview" && <OwnerOverview data={data} navigate={navigate} />}
          {view === "downloads" && <OwnerDownloads data={data} navigate={navigate} />}
          {view === "memberships" && <OwnerMemberships data={data} navigate={navigate} />}
          {view === "website" && <OwnerWebsite data={data} tab={tab} />}
          {view === "usage" && <OwnerUsage data={data} tab={tab} />}
          {view === "tracking" && <OwnerTracking data={data} />}
        </>}
      </>}
  </OwnerShell>;
}
