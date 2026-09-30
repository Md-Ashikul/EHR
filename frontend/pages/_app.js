import '../styles/globals.css'
import { KeySessionProvider } from '../lib/crypto/keySession'

function MyApp({ Component, pageProps }) {
  return (
    <KeySessionProvider>
      <Component {...pageProps} />
    </KeySessionProvider>
  )
}
export default MyApp
