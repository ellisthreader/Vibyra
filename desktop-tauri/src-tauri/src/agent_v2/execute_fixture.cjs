const fs = require('node:fs');
const readline = require('node:readline');
const emit = (value, flushed) => process.stdout.write(JSON.stringify(value) + '\n', flushed);
readline.createInterface({input: process.stdin}).on('line', line => {
  const message = JSON.parse(line);
  const subtype = message.request?.subtype;
  const reply = response => emit({type:'control_response', response:{
    subtype:'success', request_id:message.request_id, response
  }});
  if (subtype === 'initialize') {
    reply({account:{email:'a@b.c', subscriptionType:'Claude Max', apiProvider:'firstParty'}});
  } else if (subtype === 'mcp_status') {
    reply({mcpServers:[{name:'vibyra-broker', status:'connected'}]});
  } else if (subtype === 'interrupt' && !process.env.FAKE_IGNORE_INTERRUPT) {
    emit({type:'result', subtype:'error_during_execution', is_error:true, result:'interrupted'}, () => process.exit(0));
  } else if (message.type === 'user') {
    process.stdout.write(fs.readFileSync(process.env.FAKE_OUT), () => {
      if (process.env.FAKE_CRASH) {
        process.stderr.write('/Users/alice/secret/project: boom\n', () => process.exit(1));
      }
    });
  }
});
