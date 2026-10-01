import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIpInput, getIpv4Subnet } from './ip.js';

test('parseIpInput accepts a raw IP and normalizes it', () => {
  assert.equal(parseIpInput('1.1.1.1').value, '1.1.1.1');
  assert.equal(parseIpInput('  2606:4700:4700::1111  ').value, '2606:4700:4700::1111');
});

test('getIpv4Subnet calculates usable range for a CIDR', () => {
  const result = getIpv4Subnet('192.168.1.10/24');
  assert.equal(result.networkAddress, '192.168.1.0');
  assert.equal(result.broadcastAddress, '192.168.1.255');
  assert.equal(result.usableHosts[0], '192.168.1.1');
  assert.equal(result.usableHosts[result.usableHosts.length - 1], '192.168.1.254');
});
