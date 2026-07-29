import type { CardSpec } from './types.js';
import { CompareChrome } from './components/CompareChrome.js';
import { ConsoleToast } from './components/ConsoleToast.js';
import { DeltaCaption } from './components/DeltaCaption.js';
import { FreezeBanner } from './components/FreezeBanner.js';
import { OutcomePair } from './components/OutcomePair.js';
import { RoiMagnifier } from './components/RoiMagnifier.js';
import { Slate } from './components/Slate.js';
import { VitalsHud } from './components/VitalsHud.js';

type CardViewProps = { card: CardSpec };

export function CardView({ card }: CardViewProps) {
  switch (card.kind) {
    case 'slate':
      return <Slate {...card.props} />;
    case 'console-toast':
      return <ConsoleToast {...card.props} />;
    case 'roi-magnifier':
      return <RoiMagnifier {...card.props} />;
    case 'vitals-hud':
      return <VitalsHud {...card.props} />;
    case 'outcome-pair':
      return <OutcomePair {...card.props} />;
    case 'compare-chrome':
      return <CompareChrome {...card.props} />;
    case 'freeze-banner':
      return <FreezeBanner {...card.props} />;
    case 'delta-caption':
      return <DeltaCaption {...card.props} />;
  }
}
