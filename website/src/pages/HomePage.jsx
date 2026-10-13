import { useEffect } from 'react';
import Seo from '../components/Seo';
import { FaqJsonLd } from '../components/JsonLd';
import { useI18n } from '../i18n/I18nContext';
import Hero from '../components/landing/Hero';
import ProblemSolution from '../components/landing/ProblemSolution';
import HowItWorks from '../components/landing/HowItWorks';
import ProofStrip from '../components/landing/ProofStrip';
import TrustStrip from '../components/landing/TrustStrip';
import Pricing from '../components/landing/Pricing';
import Faq from '../components/landing/Faq';
import Contact from '../components/landing/Contact';
import FinalCta from '../components/landing/FinalCta';

function useReveal(lang) {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal:not(.is-in)');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-in');
      }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    els.forEach((el) => io.observe(el));
    requestAnimationFrame(() => {
      document.querySelectorAll('.hero .reveal').forEach((el) => el.classList.add('is-in'));
    });
    return () => io.disconnect();
  }, [lang]);
}

export default function HomePage() {
  const { t, lang } = useI18n();
  useReveal(lang);
  return (
    <>
      <Seo title={t('seo.title')} description={t('seo.description')} path="/" />
      <FaqJsonLd items={t('faq.items')} />
      <div className="landing-ambient" aria-hidden />
      <Hero />
      <ProblemSolution />
      <HowItWorks />
      <ProofStrip />
      <TrustStrip />
      <Pricing />
      <Faq />
      <Contact />
      <FinalCta />
    </>
  );
}
