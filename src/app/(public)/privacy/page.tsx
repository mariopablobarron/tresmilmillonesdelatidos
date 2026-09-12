'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TYPOGRAPHY, COMPONENTS, LAYOUTS, GRADIENTS } from '@/styles/design-system';

// Estructura visual fija: 11 secciones con IDs estables.
// Cada sección puede tener: intro (párrafo previo a items), items (lista), outro (párrafos posteriores).
// Copy desde messages.privacy.section.<id>.{title, intro, item1.., outro1..}
//
// Los items y outros usan t.rich() para soportar <strong>, <link>, <mailto>, <code>.
type SectionDef = {
  id: string;
  hasIntro?: boolean;
  itemsCount?: number;
  outroCount?: number;
  // Mapa de href para tags <link href="..."> dentro del body
  linkHref?: string;
  mailtoHref?: string;
};

const SECTIONS: SectionDef[] = [
  { id: 'responsable', itemsCount: 5, mailtoHref: 'mailto:privacidad@tresmilmillonesdelatidos.es' },
  { id: 'datos', itemsCount: 11, outroCount: 1 },
  { id: 'baseJuridica', itemsCount: 4 },
  { id: 'finalidad', itemsCount: 6, outroCount: 1 },
  // AI Act (Reglamento UE 2024/1689) art. 50 + RGPD arts. 9 y 22.
  { id: 'inteligenciaArtificial', hasIntro: true, itemsCount: 5, outroCount: 1 },
  { id: 'terceros', hasIntro: true, itemsCount: 5, outroCount: 1 },
  { id: 'transferencias', outroCount: 1 },
  { id: 'retencion', itemsCount: 4 },
  { id: 'cookies', hasIntro: true, itemsCount: 3, outroCount: 1 },
  { id: 'derechos', hasIntro: true, itemsCount: 6, outroCount: 2,
    mailtoHref: 'mailto:privacidad@tresmilmillonesdelatidos.es',
    linkHref: 'https://www.aepd.es' },
  { id: 'menores', outroCount: 1 },
  { id: 'cambios', outroCount: 1 },
];

function richTags(linkHref?: string, mailtoHref?: string): Record<string, (chunks: ReactNode) => ReactNode> {
  return {
    strong: (chunks) => <strong className="text-white">{chunks}</strong>,
    code: (chunks) => <span className="font-mono text-zinc-300">{chunks}</span>,
    link: (chunks) => linkHref ? (
      <a href={linkHref} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">
        {chunks}
      </a>
    ) : <>{chunks}</>,
    mailto: (chunks) => mailtoHref ? (
      <a href={mailtoHref} className="text-cyan-400 hover:underline">{chunks}</a>
    ) : <>{chunks}</>,
  };
}

export default function PrivacyPage() {
  const t = useTranslations('privacy');

  return (
    <div className={`min-h-screen bg-linear-to-br ${GRADIENTS.background} py-20 px-4`}>
      <div className={`${LAYOUTS.sectionInner} max-w-3xl space-y-8`}>
        <h1 className={`${TYPOGRAPHY.h1} text-white`}>{t('title')}</h1>
        <p className="text-sm text-zinc-500">{t('lastUpdated')}</p>

        <div className={`${COMPONENTS.card} p-8 space-y-6`}>
          {SECTIONS.map((s, idx) => {
            const tags = richTags(s.linkHref, s.mailtoHref);
            return (
              <section
                key={s.id}
                className={`space-y-4 ${idx > 0 ? 'border-t border-zinc-800 pt-6' : ''}`}
              >
                <h2 className={`${TYPOGRAPHY.h2} text-white`}>
                  {idx + 1}. {t(`section.${s.id}.title`)}
                </h2>

                {s.hasIntro && (
                  <p className="text-zinc-300 leading-relaxed">
                    {t.rich(`section.${s.id}.intro`, tags)}
                  </p>
                )}

                {s.itemsCount && s.itemsCount > 0 && (
                  <ul className="space-y-2 text-zinc-300">
                    {Array.from({ length: s.itemsCount }).map((_, i) => (
                      <li key={i}>
                        {t.rich(`section.${s.id}.item${i + 1}`, tags)}
                      </li>
                    ))}
                  </ul>
                )}

                {s.outroCount && s.outroCount > 0 && Array.from({ length: s.outroCount }).map((_, i) => (
                  <p key={i} className="text-zinc-400 text-sm leading-relaxed">
                    {t.rich(`section.${s.id}.outro${i + 1}`, tags)}
                  </p>
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
