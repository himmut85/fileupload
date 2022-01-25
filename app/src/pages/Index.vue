<template>
  <q-page class="flex flex-center">
    <q-uploader
      style="max-width: 300px"
      :factory="factoryFn"
      label="Dosya seçiniz"
      multiple
      accept=".jpg, image/*, video/*"
      max-file-size="314572800"
      send-raw
      @rejected="onRejected"
      @failed="onFailed"
    />
  </q-page>
</template>

<script>
export default {
  name: 'PageIndex',
  data () {
    return {
      files: []
    };
  },
  methods: {
    factoryFn (files) {
      console.log(files);
      return {
        url: process.env.API + '/upload',
        method: 'POST',
        headers: [
          { name: 'Content-Type', value: 'application/octet-stream' },
          { name: 'File-Name', value: files[0].name }
        ]
      }
    },
    onFailed (info) {
      console.log(info);
      this.$q.notify({
        type: 'negative',
        message: `Failed to upload file(s)`
      });
    },
    onRejected (rejectedEntries) {
      console.log(rejectedEntries);
      this.$q.notify({
        type: 'negative',
        message: `${rejectedEntries.length} file(s) did not pass validation constraints`
      });
    }
  }
}
</script>
