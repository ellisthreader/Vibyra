import { registerRootComponent } from 'expo';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GenerationFixture } from './generationFixture';
function NativeGenerationFixture() {
  return <SafeAreaProvider><GenerationFixture /></SafeAreaProvider>;
}
registerRootComponent(NativeGenerationFixture);
