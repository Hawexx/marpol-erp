import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, MessageStrip, Title } from '@ui5/webcomponents-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Render sirasinda olusan hatalari yakalar.
 *
 * Bu sinir olmadan tek bir istisna (ornegin gecersiz bir tarihten gelen
 * RangeError) tum uygulamayi bos ekrana dusuruyor, kullanicinin doldurdugu
 * form da beraberinde kayboluyordu.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ARAYUZ HATASI]', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mp-page" style={{ padding: '2rem' }}>
        <Title level="H3">Beklenmeyen bir hata oluştu</Title>
        <MessageStrip design="Negative" hideCloseButton style={{ margin: '1rem 0' }}>
          {error.message || 'Ekran yüklenirken bir sorun çıktı.'}
        </MessageStrip>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button design="Emphasized" onClick={() => this.setState({ error: null })}>
            Tekrar Dene
          </Button>
          <Button onClick={() => window.location.reload()}>Sayfayı Yenile</Button>
        </div>
      </div>
    );
  }
}
