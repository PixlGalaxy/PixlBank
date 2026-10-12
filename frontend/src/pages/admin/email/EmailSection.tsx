import { useCallback, useState } from 'react';
import SmtpStatusCard from './SmtpStatusCard';
import SmtpConnectionCard from './SmtpConnectionCard';
import RemindersCard from './RemindersCard';
import TestEmailsCard from './TestEmailsCard';
import RecentEmailsCard from './RecentEmailsCard';
import EmailTemplatesCard from './EmailTemplatesCard';

/**
 * Everything about outgoing email: whether the server answers, how to reach it,
 * the daily reminders, test sends, what went out lately and the templates.
 */
const EmailSection = () => {
  // Bumped after anything that changes the connection or sends mail, so the status and the log catch up.
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return (
    <div className="space-y-6">
      <SmtpStatusCard refreshKey={refreshKey} />
      <SmtpConnectionCard onChanged={refresh} />
      <RemindersCard onSent={refresh} />
      <TestEmailsCard onSent={refresh} />
      <RecentEmailsCard refreshKey={refreshKey} />
      <EmailTemplatesCard />
    </div>
  );
};

export default EmailSection;
