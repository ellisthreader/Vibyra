import { Text, View } from 'react-native';
import { useTheme } from '../theme';
import { styles as s } from './ComputersScreenStyles';
import { describeLocation, displayAddress, onThisDevice } from './hostIdentity';
import { useWhereabouts } from './hostLocation';

/** Show the address reached by the phone, or the Mac's public IP in Simulator. */
export function AddressFacts({ address }: { address: string }) {
  const found = useWhereabouts(address);
  const asking = found === undefined;
  const local = onThisDevice(address);
  const ip = local ? found?.ip : displayAddress(address);
  return <>
    {ip ? <Fact label={local ? 'Public IP' : 'IP address'} value={ip} long={ip.includes(':')} />
      : local && asking ? <Fact label="Public IP" value="Locating…" quiet /> : null}
    <Fact label="Location" quiet={asking}
      value={asking ? 'Locating…' : (found?.place ?? describeLocation(address))} />
  </>;
}

export function Fact({ label, value, quiet, long }: {
  label: string; value: string; quiet?: boolean; long?: boolean;
}) {
  const { colors } = useTheme();
  return <View style={[s.fact, long && s.factLong, { borderBottomColor: colors.border }]}>
    <Text style={[s.factLabel, { color: colors.muted }]}>{label}</Text>
    <Text numberOfLines={long ? 2 : 1} selectable
      style={[s.factValue, { color: quiet ? colors.muted : colors.text }]}>{value}</Text>
  </View>;
}
