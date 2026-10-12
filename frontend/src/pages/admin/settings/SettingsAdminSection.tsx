import AppearanceDefaultsCard from './AppearanceDefaultsCard';
import GeneralCard from './GeneralCard';
import OllamaCard from './OllamaCard';
import ServerSecurityCard from './ServerSecurityCard';
import ServicesCard from './ServicesCard';

/** Everything that used to live in .env, now editable without a container recreate. */
const SettingsAdminSection = () => (
  <div className="space-y-6">
    <GeneralCard />
    <OllamaCard />
    <AppearanceDefaultsCard />
    <ServerSecurityCard />
    <ServicesCard />
  </div>
);

export default SettingsAdminSection;
