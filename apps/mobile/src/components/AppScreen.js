import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function AppScreen({ children, style, edges = ['top', 'bottom'] }) {
  return (
    <SafeAreaView edges={edges} style={[styles.container, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
